import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, hasDatabase, schema } from "../db";
import { newToken } from "../ids";
import { sha256 } from "./password";
import { isProduction } from "../env";

export const SESSION_COOKIE = "twt_session";
const LONG = 30 * 24 * 3600; // keep me signed in
const SHORT = 12 * 3600;

export type Role = "admin" | "management" | "hr" | "member";
export const ROLES: Role[] = ["admin", "management", "hr", "member"];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  management: "Management",
  hr: "HR",
  member: "Team member",
};
export const ROLE_HELP: Record<Role, string> = {
  admin: "Sees everything and runs Settings: access, people, import, backups.",
  management: "MD and Directors. Sees every task, score and number.",
  hr: "Sees every person's scorecards and improvement plans.",
  member: "Sees their own work and the work of anyone who reports to them.",
};

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  personId: string | null;
};

export const currentViewer = cache(async (): Promise<Viewer | null> => {
  if (!hasDatabase()) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      status: schema.users.status,
      personId: schema.users.personId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r || r.status !== "active") return null;
  return { userId: r.userId, email: r.email, name: r.name, role: (r.role as Role) ?? "member", personId: r.personId };
});

/** For pages and actions that need a signed-in person. */
export async function requireViewer(): Promise<Viewer> {
  if (!hasDatabase()) redirect("/not-ready");
  const v = await currentViewer();
  if (!v) redirect("/login");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (v.role !== "admin") throw new Error("Only an admin can do this.");
  return v;
}

export async function startSession(userId: string, remember: boolean): Promise<void> {
  const token = newToken();
  const h = await headers();
  const ttl = remember ? LONG : SHORT;
  await db().insert(schema.sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + ttl * 1000),
    userAgent: (h.get("user-agent") ?? "").slice(0, 200),
  });
  // tidy expired sessions now and then
  if (Math.random() < 0.1) await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    ...(remember ? { maxAge: ttl } : {}),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && hasDatabase()) await db().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}
