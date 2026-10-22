"use server";

import { redirect } from "next/navigation";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { hashPassword, verifyPassword, passwordProblem, sameSecret, sha256 } from "../auth/password";
import { startSession, endSession, clientIp, requireAdmin } from "../auth/session";
import { lockedFor, recordFailure, clearFailures } from "../auth/limits";
import { setupCode } from "../env";
import { str, bool, normEmail, isEmail, type ActionResult } from "../form";
import { logActivity } from "../activity";
import { notify } from "../notify";

async function userCount(): Promise<number> {
  const r = await db().select({ n: count() }).from(schema.users);
  return Number(r[0]?.n ?? 0);
}

export async function setupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if ((await userCount()) > 0) redirect("/login");
  const code = setupCode();
  if (!code) return { ok: false, error: "SETUP_CODE is not set in Vercel. Add it under Settings, Environment Variables, then redeploy." };
  if (!sameSecret(str(fd, "code"), code)) return { ok: false, error: "That setup code is not right.", field: "code" };
  const name = str(fd, "name", 120);
  const email = normEmail(str(fd, "email", 200));
  const password = str(fd, "password", 200);
  if (!name) return { ok: false, error: "Enter your name.", field: "name" };
  if (!isEmail(email)) return { ok: false, error: "Enter your work email.", field: "email" };
  const p = passwordProblem(password);
  if (p) return { ok: false, error: p, field: "password" };
  const id = newId();
  await db().insert(schema.users).values({ id, email, name, passwordHash: await hashPassword(password), role: "admin", status: "active", lastLoginAt: new Date() });
  await logActivity({ userId: id, name }, "setup", "user", id, `${name} set up the Work Tracker`);
  await startSession(id, true);
  redirect("/settings/import?welcome=1");
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = normEmail(str(fd, "email", 200));
  const password = str(fd, "password", 200);
  const remember = bool(fd, "remember");
  const next = str(fd, "next", 300);
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  if ((await userCount()) === 0) redirect("/setup");
  const ip = await clientIp();
  const mins = await lockedFor([`email:${email}`, `ip:${ip}`]);
  if (mins) return { ok: false, error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask an admin for a reset link.` };
  const u = (await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1))[0];
  const ok = u ? await verifyPassword(password, u.passwordHash) : false;
  if (!u || !ok) {
    await recordFailure(email, ip);
    return { ok: false, error: "That email and password don't match." };
  }
  if (u.status === "disabled") return { ok: false, error: "This account has been turned off. Ask an admin." };
  await clearFailures(email);
  if (u.status === "pending") redirect("/pending");
  await db().update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  await startSession(u.id, remember);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/my");
}

export async function signupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if ((await userCount()) === 0) redirect("/setup");
  const name = str(fd, "name", 120);
  const email = normEmail(str(fd, "email", 200));
  const password = str(fd, "password", 200);
  if (!name) return { ok: false, error: "Enter your name.", field: "name" };
  if (!isEmail(email)) return { ok: false, error: "Enter your work email.", field: "email" };
  const p = passwordProblem(password);
  if (p) return { ok: false, error: p, field: "password" };
  if (password !== str(fd, "confirm", 200)) return { ok: false, error: "The two passwords are different.", field: "confirm" };
  const exists = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists.length) return { ok: false, error: "There is already an account with this email. Sign in instead." };
  // Link to the matching person when the email is already on the team list.
  const person = (await db().select().from(schema.people).where(eq(schema.people.email, email)).limit(1))[0];
  const id = newId();
  await db().insert(schema.users).values({ id, email, name, passwordHash: await hashPassword(password), role: "member", status: "pending", personId: person?.id ?? null });
  await logActivity({ userId: id, name }, "signup", "user", id, `${name} (${email}) asked for access`);
  const admins = await db().select({ personId: schema.users.personId }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));
  await notify(admins.map((a) => a.personId), { kind: "approval", title: `${name} asked for access`, body: email, link: "/settings/access" });
  redirect("/pending");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function resetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = str(fd, "token", 200);
  const password = str(fd, "password", 200);
  const p = passwordProblem(password);
  if (p) return { ok: false, error: p, field: "password" };
  if (password !== str(fd, "confirm", 200)) return { ok: false, error: "The two passwords are different.", field: "confirm" };
  const t = (
    await db()
      .select()
      .from(schema.resetTokens)
      .where(and(eq(schema.resetTokens.id, sha256(token)), isNull(schema.resetTokens.usedAt), gt(schema.resetTokens.expiresAt, new Date())))
      .limit(1)
  )[0];
  if (!t) return { ok: false, error: "This link has been used or has expired. Ask an admin for a new one." };
  const u = (await db().select().from(schema.users).where(eq(schema.users.id, t.userId)).limit(1))[0];
  if (!u || u.status === "disabled") return { ok: false, error: "This account has been turned off. Ask an admin." };
  await db().update(schema.users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(schema.users.id, u.id));
  await db().update(schema.resetTokens).set({ usedAt: new Date() }).where(eq(schema.resetTokens.id, t.id));
  await db().delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
  await clearFailures(u.email);
  await logActivity({ userId: u.id, name: u.name }, "password_reset", "user", u.id, `${u.name} set a new password with a reset link`);
  if (u.status === "pending") redirect("/pending");
  await startSession(u.id, false);
  redirect("/my");
}

/** An admin who forgot their password can set a new one with the SETUP_CODE. */
export async function recoverAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const code = setupCode();
  const email = normEmail(str(fd, "email", 200));
  if (!code || !sameSecret(str(fd, "code"), code)) return { ok: false, error: "That setup code is not right." };
  const password = str(fd, "password", 200);
  const p = passwordProblem(password);
  if (p) return { ok: false, error: p, field: "password" };
  const u = (await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1))[0];
  if (!u || u.role !== "admin") return { ok: false, error: "No admin account has that email." };
  await db().update(schema.users).set({ passwordHash: await hashPassword(password), status: "active", updatedAt: new Date() }).where(eq(schema.users.id, u.id));
  await clearFailures(email);
  await logActivity({ userId: u.id, name: u.name }, "admin_recover", "user", u.id, `${u.name} recovered admin access with the setup code`);
  await startSession(u.id, false);
  redirect("/my");
}

/** Admin: make a one-use reset link, valid 24 hours. Returns the link to pass on. */
export async function makeResetLink(userId: string): Promise<ActionResult<{ link: string }>> {
  const v = await requireAdmin();
  const { newToken } = await import("../ids");
  const { appUrl } = await import("../env");
  const u = (await db().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  if (!u) return { ok: false, error: "No such account." };
  const token = newToken();
  await db().insert(schema.resetTokens).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + 24 * 3600 * 1000), createdBy: v.userId });
  await logActivity(v, "reset_link", "user", userId, `${v.name} made a reset link for ${u.name}`);
  return { ok: true, data: { link: `${appUrl()}/reset/${token}` } };
}

export async function hasUsers(): Promise<boolean> {
  return (await userCount()) > 0;
}
