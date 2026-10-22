"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer } from "../auth/session";
import { getOrg, seesEverything } from "../org";
import { logActivity } from "../activity";
import { fail, type ActionResult } from "../form";
import { todayISO, isISODate } from "../domain/dates";
import { KINDS, KIND_LABEL } from "../data/meetings";

/** Who is expected at a meeting: the department, or the heads for company-wide reviews. */
async function expected(kind: string, departmentId: string | null, chairId: string | null): Promise<string[]> {
  const org = await getOrg();
  let ids: string[];
  if (departmentId) ids = org.active.filter((p) => p.departmentId === departmentId && !p.isVacancy).map((p) => p.id);
  else if (kind === "management_review" || kind === "monthly_review") {
    const heads = new Set<string>();
    for (const d of org.departments) {
      if (d.headPersonId) heads.add(d.headPersonId);
      if (d.directorPersonId) heads.add(d.directorPersonId);
    }
    ids = [...heads].filter((id) => org.byId.get(id) && !org.byId.get(id)!.isVacancy && org.byId.get(id)!.active);
  } else ids = [];
  if (chairId && !ids.includes(chairId)) ids.unshift(chairId);
  return ids;
}

export async function startMeeting(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const rhythmId = String(fd.get("rhythmId") ?? "") || null;
  let chair: string | null = v.personId;
  let kind = String(fd.get("kind") ?? "other");
  let title = String(fd.get("title") ?? "").trim();
  let departmentId = String(fd.get("departmentId") ?? "") || null;
  const heldOn = String(fd.get("heldOn") ?? "") || todayISO();
  const withPerson = String(fd.get("personId") ?? "") || null;
  if (rhythmId) {
    const r = (await db().select().from(schema.meetingRhythm).where(eq(schema.meetingRhythm.id, rhythmId)).limit(1))[0];
    if (r) {
      kind = r.kind;
      title = title || r.title;
      chair = r.chairPersonId ?? v.personId;
      departmentId = r.departmentId;
      // one record per rhythm meeting per day: reopen it if it exists
      const existing = (await db().select().from(schema.meetings).where(and(eq(schema.meetings.rhythmId, r.id), eq(schema.meetings.heldOn, heldOn))).limit(1))[0];
      if (existing) redirect(`/meetings/${existing.id}`);
    }
  }
  if (!KINDS.includes(kind)) kind = "other";
  const org = await getOrg();
  if (kind === "one_to_one" && withPerson) title = title || `One-to-one: ${org.byId.get(withPerson)?.name ?? ""}`;
  title = title || KIND_LABEL[kind];
  const id = newId();
  const attendees = kind === "one_to_one" ? [v.personId, withPerson].filter((x): x is string => !!x) : await expected(kind, departmentId, chair);
  await db().insert(schema.meetings).values({
    id,
    rhythmId,
    kind,
    title: title.slice(0, 160),
    departmentId,
    heldOn: isISODate(heldOn) ? heldOn : todayISO(),
    chairPersonId: chair,
    attendeeIds: attendees,
    createdBy: v.personId,
  });
  await logActivity(v, "start", "meeting", id, `${v.name} started ${title}`);
  redirect(`/meetings/${id}`);
}

export async function updateMeeting(id: string, patch: { notes?: string; decisions?: string; attendeeIds?: string[]; absentIds?: string[]; title?: string }): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const m = (await db().select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1))[0];
    if (!m) return { ok: false, error: "This meeting no longer exists." };
    const allowed = seesEverything(v) || m.chairPersonId === v.personId || m.createdBy === v.personId || (!!v.personId && m.attendeeIds.includes(v.personId));
    if (!allowed) return { ok: false, error: "Only the chair or people at the meeting can change its record." };
    const set: Partial<typeof schema.meetings.$inferInsert> = { updatedAt: new Date() };
    if (patch.notes !== undefined) set.notes = patch.notes.slice(0, 20000);
    if (patch.decisions !== undefined) set.decisions = patch.decisions.slice(0, 20000);
    if (patch.attendeeIds) set.attendeeIds = [...new Set(patch.attendeeIds)].slice(0, 80);
    if (patch.absentIds) set.absentIds = [...new Set(patch.absentIds)].slice(0, 80);
    if (patch.title !== undefined && patch.title.trim()) set.title = patch.title.trim().slice(0, 160);
    await db().update(schema.meetings).set(set).where(eq(schema.meetings.id, id));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const m = (await db().select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1))[0];
    if (!m) return { ok: true };
    if (!(v.role === "admin" || m.createdBy === v.personId)) return { ok: false, error: "Only the person who started it, or an admin, can delete a meeting record." };
    await db().update(schema.tasks).set({ meetingId: null }).where(eq(schema.tasks.meetingId, id));
    await db().delete(schema.meetings).where(eq(schema.meetings.id, id));
    await logActivity(v, "delete", "meeting", id, `${v.name} deleted the record of ${m.title} (${m.heldOn})`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRhythm(input: { id?: string; title: string; kind: string; departmentId: string | null; cadence: string; day: number | null; time: string; durationMin: number; chairPersonId: string | null; purpose: string; active: boolean }): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    if (!seesEverything(v)) return { ok: false, error: "Only management or an admin can change the meeting rhythm." };
    if (!input.title.trim()) return { ok: false, error: "Name the meeting." };
    if (!KINDS.includes(input.kind)) return { ok: false, error: "Pick a kind." };
    if (!["daily", "weekly", "monthly", "quarterly"].includes(input.cadence)) return { ok: false, error: "Pick how often." };
    const values = {
      title: input.title.trim().slice(0, 120),
      kind: input.kind,
      departmentId: input.departmentId || null,
      cadence: input.cadence,
      day: input.cadence === "weekly" ? Math.min(7, Math.max(1, input.day ?? 1)) : input.cadence === "monthly" ? Math.min(28, Math.max(1, input.day ?? 1)) : null,
      time: input.time.slice(0, 10),
      durationMin: Math.min(480, Math.max(5, input.durationMin || 15)),
      chairPersonId: input.chairPersonId || null,
      purpose: input.purpose.slice(0, 300),
      active: input.active,
    };
    if (input.id) await db().update(schema.meetingRhythm).set(values).where(eq(schema.meetingRhythm.id, input.id));
    else await db().insert(schema.meetingRhythm).values({ id: newId(), ...values, sort: 99 });
    await logActivity(v, "rhythm", "meeting", input.id ?? null, `${v.name} ${input.id ? "changed" : "added"} the meeting ${values.title}`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
