"use server";

import { refresh } from "next/cache";
import { eq, max } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer } from "../auth/session";
import { seesEverything } from "../org";
import { logActivity } from "../activity";
import { notify } from "../notify";
import { fail, type ActionResult } from "../form";
import { isISODate, todayISO } from "../domain/dates";

async function canChange(initiativeId: string | null) {
  const v = await requireViewer();
  if (seesEverything(v)) return v;
  if (initiativeId) {
    const i = (await db().select().from(schema.initiatives).where(eq(schema.initiatives.id, initiativeId)).limit(1))[0];
    if (i && i.ownerPersonId === v.personId) return v;
  }
  throw new Error("Only the initiative's owner or management can change it.");
}

export async function saveInitiative(input: { id?: string; name: string; description: string; ownerPersonId: string | null; startDate: string; endDate: string; status: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const v = input.id ? await canChange(input.id) : await canChange(null);
    const name = input.name.trim().slice(0, 140);
    if (!name) return { ok: false, error: "Name the initiative." };
    if (!["planned", "active", "on_hold", "done"].includes(input.status)) return { ok: false, error: "Pick a status." };
    const values = {
      name,
      description: input.description.slice(0, 4000),
      ownerPersonId: input.ownerPersonId || null,
      startDate: isISODate(input.startDate) ? input.startDate : null,
      endDate: isISODate(input.endDate) ? input.endDate : null,
      status: input.status,
      updatedAt: new Date(),
    };
    const id = input.id ?? newId();
    if (input.id) await db().update(schema.initiatives).set(values).where(eq(schema.initiatives.id, id));
    else await db().insert(schema.initiatives).values({ id, ...values, createdBy: v.personId });
    await logActivity(v, input.id ? "update" : "create", "initiative", id, `${v.name} ${input.id ? "updated" : "started"} the initiative ${name}`);
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveMilestone(input: { id?: string; initiativeId: string; name: string; dueDate: string; criteria: string }): Promise<ActionResult> {
  try {
    const v = await canChange(input.initiativeId);
    const name = input.name.trim().slice(0, 140);
    if (!name) return { ok: false, error: "Name the milestone." };
    const values = { name, dueDate: isISODate(input.dueDate) ? input.dueDate : null, criteria: input.criteria.slice(0, 1000) };
    if (input.id) await db().update(schema.milestones).set(values).where(eq(schema.milestones.id, input.id));
    else {
      const r = await db().select({ m: max(schema.milestones.sort) }).from(schema.milestones).where(eq(schema.milestones.initiativeId, input.initiativeId));
      await db().insert(schema.milestones).values({ id: newId(), initiativeId: input.initiativeId, ...values, sort: (r[0]?.m ?? 0) + 1 });
    }
    await logActivity(v, "milestone", "initiative", input.initiativeId, `${v.name} ${input.id ? "changed" : "added"} the milestone ${name}`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function setMilestoneStatus(id: string, status: "pending" | "met" | "missed"): Promise<ActionResult> {
  try {
    const ms = (await db().select().from(schema.milestones).where(eq(schema.milestones.id, id)).limit(1))[0];
    if (!ms) return { ok: false, error: "This milestone no longer exists." };
    const v = await canChange(ms.initiativeId);
    await db().update(schema.milestones).set({ status, metOn: status === "met" ? todayISO() : null }).where(eq(schema.milestones.id, id));
    const init = (await db().select().from(schema.initiatives).where(eq(schema.initiatives.id, ms.initiativeId)).limit(1))[0];
    if (status !== "pending") {
      const heads = await db().select({ personId: schema.users.personId }).from(schema.users).where(eq(schema.users.role, "management"));
      await notify([init?.ownerPersonId, ...heads.map((h) => h.personId)], { kind: "status", title: `${ms.name}: ${status === "met" ? "met" : "missed"}`, body: init?.name ?? "", link: `/initiatives/${ms.initiativeId}` }, v.personId);
    }
    await logActivity(v, "milestone_status", "initiative", ms.initiativeId, `${v.name} marked ${ms.name} as ${status}`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  try {
    const ms = (await db().select().from(schema.milestones).where(eq(schema.milestones.id, id)).limit(1))[0];
    if (!ms) return { ok: true };
    const v = await canChange(ms.initiativeId);
    await db().update(schema.tasks).set({ milestoneId: null }).where(eq(schema.tasks.milestoneId, id));
    await db().delete(schema.milestones).where(eq(schema.milestones.id, id));
    await logActivity(v, "delete", "milestone", id, `${v.name} removed the milestone ${ms.name}`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
