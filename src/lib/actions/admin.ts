"use server";

import { refresh } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireAdmin, requireViewer, ROLES, type Role } from "../auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { logActivity } from "../activity";
import { notify } from "../notify";
import { bool, fail, int, isEmail, normEmail, str, type ActionResult } from "../form";
import { readWorkbook, planImport, applyImport } from "../excel/structure";
import { makeBackup } from "../backup";
import { getSettings, saveSetting } from "../settings";
import { getOrg, subtree } from "../org";

// ---------------------------------------------------------------- import

export type PreviewResult = ActionResult<{ counts: Record<string, { add: number; update: number }>; warnings: string[]; errors: string[] }>;

async function fileFrom(fd: FormData): Promise<ArrayBuffer> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) throw new Error("Choose the Excel file first.");
  if (f.size > 4 * 1024 * 1024) throw new Error("That file is over 4 MB. Remove pictures or extra sheets and try again.");
  if (!/\.xlsx$/i.test(f.name)) throw new Error("Upload an .xlsx file (Excel workbook).");
  return f.arrayBuffer();
}

export async function previewImport(_: PreviewResult | null, fd: FormData): Promise<PreviewResult> {
  try {
    await requireAdmin();
    const rows = await readWorkbook(await fileFrom(fd));
    if (!Object.keys(rows).length) return { ok: false, error: "No sheets with the expected names were found. Download the template to see the layout." };
    const plan = await planImport(rows);
    return { ok: true, data: { counts: plan.counts, warnings: plan.warnings, errors: plan.errors } };
  } catch (e) {
    return fail(e);
  }
}

export async function runImport(_: ActionResult<{ done: Record<string, number> }> | null, fd: FormData): Promise<ActionResult<{ done: Record<string, number> }>> {
  try {
    const v = await requireAdmin();
    const rows = await readWorkbook(await fileFrom(fd));
    const plan = await planImport(rows);
    if (plan.errors.length) return { ok: false, error: `Fix these first: ${plan.errors.slice(0, 3).join(" ")}` };
    await makeBackup("manual", v.userId); // a copy of everything before the import
    const done = await applyImport(rows, v.personId);
    await logActivity(v, "import", "structure", null, `Imported the team workbook: ${Object.entries(done).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}`, done);
    refresh();
    return { ok: true, data: { done } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- access

export async function approveUser(userId: string, role: string, personId: string | null): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    if (!ROLES.includes(role as Role)) return { ok: false, error: "Pick a role." };
    const u = (await db().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
    if (!u) return { ok: false, error: "No such account." };
    if (personId) {
      const taken = await db().select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.personId, personId), ne(schema.users.id, userId))).limit(1);
      if (taken.length) return { ok: false, error: "Another account is already linked to that person." };
    }
    await db().update(schema.users).set({ status: "active", role, personId, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    if (personId && u.email) await db().update(schema.people).set({ email: u.email }).where(and(eq(schema.people.id, personId)));
    await logActivity(v, "approve", "user", userId, `${v.name} approved ${u.name} as ${role}`);
    await notify([personId], { kind: "approval", title: "Your Work Tracker account is ready", body: "Sign in to see your tasks and role card.", link: "/my" });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUser(userId: string, patch: { role?: string; personId?: string | null; status?: "active" | "disabled" }): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const u = (await db().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
    if (!u) return { ok: false, error: "No such account." };
    const set: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
    if (patch.role !== undefined) {
      if (!ROLES.includes(patch.role as Role)) return { ok: false, error: "Unknown role." };
      if (u.role === "admin" && patch.role !== "admin") {
        const admins = await db().select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));
        if (admins.length <= 1) return { ok: false, error: "Keep at least one admin. Make someone else admin first." };
      }
      set.role = patch.role;
    }
    if (patch.personId !== undefined) {
      if (patch.personId) {
        const taken = await db().select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.personId, patch.personId), ne(schema.users.id, userId))).limit(1);
        if (taken.length) return { ok: false, error: "Another account is already linked to that person." };
      }
      set.personId = patch.personId;
    }
    if (patch.status !== undefined) {
      if (userId === v.userId && patch.status === "disabled") return { ok: false, error: "You can't turn off your own account." };
      set.status = patch.status;
      if (patch.status === "disabled") await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    }
    await db().update(schema.users).set(set).where(eq(schema.users.id, userId));
    await logActivity(v, "update", "user", userId, `${v.name} changed ${u.name}'s account (${Object.keys(patch).join(", ")})`, patch);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectUser(userId: string): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const u = (await db().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
    if (!u || u.status !== "pending") return { ok: false, error: "Only a pending request can be turned down." };
    await db().delete(schema.users).where(eq(schema.users.id, userId));
    await logActivity(v, "reject", "user", userId, `${v.name} turned down ${u.name} (${u.email})`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- people and departments

export async function savePerson(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const id = str(fd, "id", 40);
    const name = str(fd, "name", 120);
    if (!name) return { ok: false, error: "Enter a name.", field: "name" };
    const email = normEmail(str(fd, "email", 200));
    if (email && !isEmail(email)) return { ok: false, error: "That email doesn't look right.", field: "email" };
    const reportsTo = str(fd, "reportsTo", 40) || null;
    const dupe = await db().select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.name, name)).limit(2);
    if (dupe.some((d) => d.id !== id)) return { ok: false, error: "Someone with this exact name is already on the list. Add a surname or initial.", field: "name" };
    if (id && reportsTo) {
      if (reportsTo === id) return { ok: false, error: "A person can't report to themselves." };
      const org = await getOrg();
      if (subtree(org, id).has(reportsTo)) return { ok: false, error: "That would make a loop: this person already manages them." };
    }
    const values = {
      name,
      designation: str(fd, "designation", 120),
      departmentId: str(fd, "departmentId", 40) || null,
      reportsTo,
      email: email || null,
      phone: str(fd, "phone", 40) || null,
      isVacancy: bool(fd, "isVacancy"),
      active: !bool(fd, "inactive"),
      rolePurpose: str(fd, "rolePurpose", 600),
      behaviours: str(fd, "behaviours", 2000).split("\n").map((s) => s.trim()).filter(Boolean),
      dottedLine: str(fd, "dottedLine", 120),
      joinedOn: str(fd, "joinedOn", 10) || null,
      updatedAt: new Date(),
    };
    if (id) await db().update(schema.people).set(values).where(eq(schema.people.id, id));
    else await db().insert(schema.people).values({ id: newId(), ...values });
    if (email) await db().execute(sql`update users u set person_id = p.id from people p where u.person_id is null and p.email is not null and lower(p.email) = u.email`);
    await logActivity(v, id ? "update" : "create", "person", id || null, `${v.name} ${id ? "updated" : "added"} ${name}`);
    refresh();
    return { ok: true, message: id ? "Saved." : `${name} added.` };
  } catch (e) {
    return fail(e);
  }
}

/** Everyone who reports to one person now reports to another, e.g. when a new head joins. */
export async function moveReports(fromId: string, toId: string): Promise<ActionResult<{ moved: number }>> {
  try {
    const v = await requireAdmin();
    if (!fromId || !toId || fromId === toId) return { ok: false, error: "Choose two different people." };
    const org = await getOrg();
    const from = org.byId.get(fromId);
    const to = org.byId.get(toId);
    if (!from || !to) return { ok: false, error: "Unknown person." };
    const moving = (org.reports.get(fromId) ?? []).filter((p) => p.id !== toId);
    for (const p of moving) {
      if (subtree(org, p.id).has(toId)) continue;
      await db().update(schema.people).set({ reportsTo: toId, updatedAt: new Date() }).where(eq(schema.people.id, p.id));
    }
    await logActivity(v, "move_reports", "person", toId, `${v.name} moved ${moving.length} people from ${from.name} to ${to.name}`);
    await notify([toId], { kind: "approval", title: `${moving.length} people now report to you`, body: moving.map((p) => p.name).join(", "), link: "/team" });
    refresh();
    return { ok: true, data: { moved: moving.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDepartment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const id = str(fd, "id", 40);
    const name = str(fd, "name", 80);
    if (!name) return { ok: false, error: "Enter a department name." };
    const values = {
      name,
      code: (str(fd, "code", 6) || name.slice(0, 3)).toUpperCase(),
      portfolio: str(fd, "portfolio", 80),
      headPersonId: str(fd, "headPersonId", 40) || null,
      directorPersonId: str(fd, "directorPersonId", 40) || null,
      sort: int(fd, "sort") ?? 0,
      active: !bool(fd, "inactive"),
      updatedAt: new Date(),
    };
    if (id) await db().update(schema.departments).set(values).where(eq(schema.departments.id, id));
    else await db().insert(schema.departments).values({ id: newId(), ...values });
    await logActivity(v, id ? "update" : "create", "department", id || null, `${v.name} ${id ? "updated" : "added"} the ${name} department`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- settings

export async function saveRules(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const s = await getSettings();
    const workingDays = fd.getAll("workingDays").map(Number).filter((n) => n >= 1 && n <= 7);
    if (!workingDays.length) return { ok: false, error: "Pick at least one working day." };
    await saveSetting("company", { name: str(fd, "companyName", 120) || s.company.name, shortName: str(fd, "shortName", 40) || s.company.shortName });
    await saveSetting("rules", {
      workingDays: workingDays.sort(),
      escalateAfterDays: Math.min(30, Math.max(1, int(fd, "escalateAfterDays") ?? 2)),
      idleAfterDays: Math.min(30, Math.max(1, int(fd, "idleAfterDays") ?? 3)),
      scoreByDay: Math.min(28, Math.max(1, int(fd, "scoreByDay") ?? 7)),
      requireSlipReason: bool(fd, "requireSlipReason"),
    });
    await saveSetting("email", { dailyDigest: bool(fd, "dailyDigest") });
    await logActivity(v, "settings", "settings", null, `${v.name} changed the rules and company details`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function backupNow(): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    await makeBackup("manual", v.userId);
    await logActivity(v, "backup", "backup", null, `${v.name} made a backup`);
    refresh();
    return { ok: true, message: "Backup made." };
  } catch (e) {
    return fail(e);
  }
}

export async function runDailyNow(): Promise<ActionResult<Record<string, number>>> {
  try {
    const v = await requireAdmin();
    const { runDailyWork } = await import("../jobs/daily");
    const { todayISO } = await import("../domain/dates");
    const r = await runDailyWork(todayISO());
    await logActivity(v, "daily_job", "system", null, `${v.name} ran the daily job by hand`);
    refresh();
    return { ok: true, data: r, message: `Done: ${r.created} repeating task${r.created === 1 ? "" : "s"} made, ${r.escalated} escalation${r.escalated === 1 ? "" : "s"}, ${r.reminders} reminder${r.reminders === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function sendTestEmail(): Promise<ActionResult> {
  try {
    const v = await requireAdmin();
    const { sendMail, mailEnabled } = await import("../mail");
    if (!mailEnabled()) return { ok: false, error: "Email isn't set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS in Vercel." };
    await sendMail(v.email, "Test from the Work Tracker", "<p>Email from the Work Tracker works.</p>", "Email from the Work Tracker works.");
    return { ok: true, message: `Sent to ${v.email}.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- own account

export async function changePassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const u = (await db().select().from(schema.users).where(eq(schema.users.id, v.userId)).limit(1))[0];
    if (!u || !(await verifyPassword(str(fd, "current", 200), u.passwordHash))) return { ok: false, error: "Your current password isn't right.", field: "current" };
    const pw = str(fd, "password", 200);
    const p = passwordProblem(pw);
    if (p) return { ok: false, error: p, field: "password" };
    if (pw !== str(fd, "confirm", 200)) return { ok: false, error: "The two new passwords are different.", field: "confirm" };
    await db().update(schema.users).set({ passwordHash: await hashPassword(pw), updatedAt: new Date() }).where(eq(schema.users.id, v.userId));
    await logActivity(v, "password", "user", v.userId, `${v.name} changed their password`);
    return { ok: true, message: "Password changed." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProfile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const name = str(fd, "name", 120);
    if (!name) return { ok: false, error: "Enter your name." };
    await db().update(schema.users).set({ name, updatedAt: new Date() }).where(eq(schema.users.id, v.userId));
    if (v.personId) {
      const phone = str(fd, "phone", 40);
      await db().update(schema.people).set({ phone: phone || null, updatedAt: new Date() }).where(eq(schema.people.id, v.personId));
    }
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
