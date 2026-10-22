"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer, type Viewer } from "../auth/session";
import { getOrg, canManage, seesEverything, managersOf, type Org } from "../org";
import { getSettings } from "../settings";
import { logActivity } from "../activity";
import { notify } from "../notify";
import { fail, type ActionResult } from "../form";
import { isISODate, todayISO, formatDate } from "../domain/dates";
import { isPriority, isSource, isStatus, isRule, firstOccurrence, STATUS_LABEL, PRIORITY_LABEL, isOpen } from "../domain/tasks";
import { matchPeople } from "../domain/quickadd";
import type { RecurrenceRule } from "../db/schema";

type Task = typeof schema.tasks.$inferSelect;

export type NewTaskInput = {
  title: string;
  description?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  priority?: string;
  project?: string;
  source?: string;
  initiativeId?: string | null;
  milestoneId?: string | null;
  meetingId?: string | null;
  kraId?: string | null;
  rule?: RecurrenceRule | null;
  leadDays?: number;
  checks?: string[];
  watcherIds?: string[];
};

function link(n: number) {
  return `/tasks?open=${n}`;
}

async function loadTask(id: string): Promise<Task> {
  const row = (await db().select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1))[0];
  if (!row) throw new Error("This task no longer exists.");
  return row;
}

async function watcherIds(taskId: string): Promise<string[]> {
  const w = await db().select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, taskId));
  return w.map((x) => x.personId);
}

function rights(org: Org, v: Viewer, task: Task, watchers: string[]) {
  const owner = !!v.personId && task.ownerId === v.personId;
  const creator = !!v.personId && task.createdBy === v.personId;
  const manages = canManage(org, v, task.ownerId);
  const edit = seesEverything(v) || creator || manages;
  const see = edit || owner || (!!v.personId && watchers.includes(v.personId));
  return { owner, creator, edit, update: edit || owner, see };
}

async function log(taskId: string, v: Viewer, kind: string, body: string, from?: string | null, to?: string | null) {
  await db().insert(schema.taskUpdates).values({
    id: newId(),
    taskId,
    authorPersonId: v.personId,
    authorName: v.name,
    kind,
    body: body.slice(0, 4000),
    fromValue: from ?? null,
    toValue: to ?? null,
  });
}

export async function createTask(input: NewTaskInput): Promise<ActionResult<{ number: number; id: string }>> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const settings = await getSettings();
    const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!title) return { ok: false, error: "Give the task a title." };
    const ownerId = input.ownerId || v.personId;
    if (!ownerId) return { ok: false, error: "Choose who owns this task. (Your account is not linked to a person yet.)" };
    const owner = org.byId.get(ownerId);
    if (!owner || !owner.active) return { ok: false, error: "That person is not on the active team list." };
    const due = input.dueDate && isISODate(input.dueDate) ? input.dueDate : null;
    const priority = isPriority(input.priority) ? input.priority : "medium";
    const source = isSource(input.source) ? input.source : ownerId === v.personId ? "self" : "director";
    const rule = input.rule && isRule(input.rule) ? input.rule : null;
    const today = todayISO();

    let seriesId: string | null = null;
    let firstDue = due;
    if (rule) {
      firstDue = due ?? firstOccurrence(rule, today, settings.rules.workingDays);
      seriesId = newId();
      await db().insert(schema.taskSeries).values({
        id: seriesId,
        title,
        description: input.description ?? "",
        ownerId,
        departmentId: owner.departmentId,
        project: (input.project ?? "").slice(0, 80),
        priority,
        rule,
        leadDays: Math.max(0, Math.min(14, input.leadDays ?? (rule.type === "daily" ? 0 : 2))),
        lastDue: firstDue,
        initiativeId: input.initiativeId ?? null,
        kraId: input.kraId ?? null,
        createdBy: v.personId,
      });
    }

    const id = newId();
    const [row] = await db()
      .insert(schema.tasks)
      .values({
        id,
        title,
        description: (input.description ?? "").slice(0, 8000),
        ownerId,
        createdBy: v.personId,
        departmentId: owner.departmentId,
        project: (input.project ?? "").trim().slice(0, 80),
        priority,
        source,
        dueDate: firstDue,
        originalDue: firstDue,
        initiativeId: input.initiativeId || null,
        milestoneId: input.milestoneId || null,
        meetingId: input.meetingId || null,
        kraId: input.kraId || null,
        seriesId,
      })
      .returning({ number: schema.tasks.number });

    const checks = (input.checks ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 50);
    if (checks.length) await db().insert(schema.taskChecks).values(checks.map((text, i) => ({ id: newId(), taskId: id, text: text.slice(0, 300), sort: i })));
    const watchers = [...new Set((input.watcherIds ?? []).filter((w) => w !== ownerId && org.byId.has(w)))];
    if (watchers.length) await db().insert(schema.taskWatchers).values(watchers.map((personId) => ({ taskId: id, personId }))).onConflictDoNothing();

    await log(id, v, "created", ownerId === v.personId ? "Created this task" : `Assigned to ${owner.name}`);
    await notify(
      [ownerId],
      { kind: "assigned", title: `${v.name} gave you T-${row.number}: ${title}`, body: firstDue ? `Due ${formatDate(firstDue)}` : "", link: link(row.number) },
      v.personId,
    );
    await notify(watchers, { kind: "assigned", title: `You're watching T-${row.number}: ${title}`, body: `Owner: ${owner.name}`, link: link(row.number) }, v.personId);
    await logActivity(v, "create", "task", id, `T-${row.number} ${title} → ${owner.name}`);
    refresh();
    return { ok: true, data: { number: row.number, id } };
  } catch (e) {
    return fail(e);
  }
}

export type TaskPatch = {
  title?: string;
  description?: string;
  status?: string;
  blockedReason?: string;
  ownerId?: string;
  dueDate?: string | null;
  priority?: string;
  project?: string;
  source?: string;
  initiativeId?: string | null;
  milestoneId?: string | null;
  kraId?: string | null;
  startDate?: string | null;
};

export async function updateTask(taskId: string, patch: TaskPatch, reason?: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const settings = await getSettings();
    const task = await loadTask(taskId);
    const watchers = await watcherIds(taskId);
    const can = rights(org, v, task, watchers);
    if (!can.update) return { ok: false, error: "You can't change this task." };

    const set: Partial<Task> = {};
    const notes: string[] = [];
    const tell: { ids: (string | null)[]; title: string }[] = [];
    const ref = `T-${task.number}`;

    if (patch.title !== undefined) {
      const title = patch.title.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!title) return { ok: false, error: "The title can't be empty." };
      if (title !== task.title) {
        set.title = title;
        await log(taskId, v, "edit", "Renamed the task", task.title, title);
      }
    }
    if (patch.description !== undefined && patch.description !== task.description) {
      set.description = patch.description.slice(0, 8000);
      notes.push("updated the description");
    }

    if (patch.ownerId !== undefined && patch.ownerId !== task.ownerId) {
      if (!can.edit) return { ok: false, error: "Only the person who gave this task, or a manager, can hand it to someone else." };
      const owner = org.byId.get(patch.ownerId);
      if (!owner || !owner.active) return { ok: false, error: "That person is not on the active team list." };
      set.ownerId = owner.id;
      set.departmentId = owner.departmentId;
      set.escalatedAt = null;
      await log(taskId, v, "owner", `Handed to ${owner.name}`, org.byId.get(task.ownerId)?.name ?? "", owner.name);
      tell.push({ ids: [owner.id], title: `${v.name} gave you ${ref}: ${set.title ?? task.title}` });
      tell.push({ ids: [task.ownerId], title: `${ref} was handed to ${owner.name}` });
    }

    if (patch.dueDate !== undefined && patch.dueDate !== task.dueDate) {
      const due = patch.dueDate && isISODate(patch.dueDate) ? patch.dueDate : null;
      const later = !!task.dueDate && (!due || due > task.dueDate);
      const why = (reason ?? "").trim();
      if (later && isOpen(task.status) && !can.edit && settings.rules.requireSlipReason && !why) {
        return { ok: false, error: "Say why the date is moving. It is shared with whoever gave you the task." };
      }
      set.dueDate = due;
      if (!task.originalDue && due) set.originalDue = due;
      if (later && isOpen(task.status)) set.slips = task.slips + 1;
      if (due && due >= todayISO()) set.escalatedAt = null;
      await log(
        taskId,
        v,
        "due",
        `Due date ${task.dueDate ? `moved from ${formatDate(task.dueDate)}` : "set"} to ${due ? formatDate(due) : "no date"}${why ? `: ${why}` : ""}`,
        task.dueDate,
        due,
      );
      if (later) tell.push({ ids: [task.createdBy, ...managersOf(org, task.ownerId).slice(0, 1).map((m) => m.id)], title: `${v.name} moved ${ref} to ${due ? formatDate(due) : "no date"}${why ? `: ${why}` : ""}` });
    }

    if (patch.status !== undefined && patch.status !== task.status) {
      if (!isStatus(patch.status)) return { ok: false, error: "Unknown status." };
      if (patch.status === "cancelled" && !can.edit) return { ok: false, error: "Only the person who gave this task, or a manager, can cancel it." };
      const blockedReason = (patch.blockedReason ?? "").trim();
      if (patch.status === "blocked" && !blockedReason) return { ok: false, error: "Say what is blocking it, so someone can help." };
      set.status = patch.status;
      set.completedAt = patch.status === "done" ? new Date() : null;
      set.blockedReason = patch.status === "blocked" ? blockedReason.slice(0, 500) : "";
      await log(
        taskId,
        v,
        "status",
        patch.status === "blocked" ? `Blocked: ${blockedReason}` : `Marked ${STATUS_LABEL[patch.status].toLowerCase()}`,
        task.status,
        patch.status,
      );
      const manager = managersOf(org, task.ownerId)[0]?.id;
      if (patch.status === "blocked") tell.push({ ids: [task.createdBy, manager, ...watchers], title: `${ref} is blocked: ${blockedReason}` });
      else if (patch.status === "done") tell.push({ ids: [task.createdBy, ...watchers], title: `${v.name} finished ${ref}: ${task.title}` });
      else if (patch.status === "cancelled") tell.push({ ids: [task.ownerId, ...watchers], title: `${ref} was cancelled: ${task.title}` });
    } else if (patch.blockedReason !== undefined && task.status === "blocked" && patch.blockedReason.trim() !== task.blockedReason) {
      set.blockedReason = patch.blockedReason.trim().slice(0, 500);
      await log(taskId, v, "status", `Blocked: ${set.blockedReason}`, "blocked", "blocked");
    }

    if (patch.priority !== undefined && patch.priority !== task.priority) {
      if (!isPriority(patch.priority)) return { ok: false, error: "Unknown priority." };
      set.priority = patch.priority;
      await log(taskId, v, "priority", `Priority set to ${PRIORITY_LABEL[patch.priority].toLowerCase()}`, task.priority, patch.priority);
      if (patch.priority === "critical") tell.push({ ids: [task.ownerId], title: `${ref} is now critical: ${task.title}` });
    }

    const editOnly: (keyof TaskPatch)[] = ["project", "source", "initiativeId", "milestoneId", "kraId", "startDate"];
    for (const k of editOnly) {
      if (patch[k] === undefined || patch[k] === (task as Record<string, unknown>)[k]) continue;
      if (k === "source" && !isSource(patch.source)) continue;
      if (k === "startDate" && patch.startDate && !isISODate(patch.startDate)) continue;
      (set as Record<string, unknown>)[k] = typeof patch[k] === "string" ? (patch[k] as string).trim().slice(0, 80) || null : patch[k];
      if (k === "project") set.project = (patch.project ?? "").trim().slice(0, 80);
    }
    if (set.initiativeId === null) set.milestoneId = null;
    if (notes.length) await log(taskId, v, "edit", notes.join(", ").replace(/^./, (c) => c.toUpperCase()));

    if (!Object.keys(set).length) return { ok: true };
    await db()
      .update(schema.tasks)
      .set({ ...set, updatedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(schema.tasks.id, taskId));
    for (const n of tell) await notify(n.ids, { kind: "status", title: n.title, link: link(task.number) }, v.personId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const task = await loadTask(taskId);
    const watchers = await watcherIds(taskId);
    const can = rights(org, v, task, watchers);
    if (!can.see) return { ok: false, error: "You can't see this task." };
    const text = body.trim().slice(0, 4000);
    if (!text) return { ok: false, error: "Write an update first." };
    await log(taskId, v, "comment", text);
    await db().update(schema.tasks).set({ lastActivityAt: new Date() }).where(eq(schema.tasks.id, taskId));

    // @mentions in an update tell that person and add them as watchers
    const mentioned = new Set<string>();
    for (const m of text.matchAll(/(^|\s)@([\p{L}][\p{L}.'_-]*)/gu)) {
      const found = matchPeople(m[2].replace(/[.'_-]+$/, ""), org.active.map((p) => ({ id: p.id, name: p.name })));
      if (found.length === 1) mentioned.add(found[0].id);
    }
    const newWatchers = [...mentioned].filter((id) => id !== task.ownerId && !watchers.includes(id));
    if (newWatchers.length) await db().insert(schema.taskWatchers).values(newWatchers.map((personId) => ({ taskId, personId }))).onConflictDoNothing();
    await notify([...mentioned], { kind: "comment", title: `${v.name} mentioned you on T-${task.number}`, body: text.slice(0, 200), link: link(task.number) }, v.personId);
    await notify(
      [task.ownerId, task.createdBy, ...watchers].filter((id) => !mentioned.has(id ?? "")),
      { kind: "comment", title: `${v.name} updated T-${task.number}: ${task.title}`, body: text.slice(0, 200), link: link(task.number) },
      v.personId,
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function checkAccess(taskId: string) {
  const v = await requireViewer();
  const org = await getOrg();
  const task = await loadTask(taskId);
  const can = rights(org, v, task, await watcherIds(taskId));
  if (!can.update) throw new Error("You can't change this task.");
  return { v, task };
}

export async function addCheck(taskId: string, text: string): Promise<ActionResult> {
  try {
    const { v } = await checkAccess(taskId);
    const t = text.trim().slice(0, 300);
    if (!t) return { ok: false, error: "Write the step first." };
    const r = await db().select({ m: max(schema.taskChecks.sort) }).from(schema.taskChecks).where(eq(schema.taskChecks.taskId, taskId));
    await db().insert(schema.taskChecks).values({ id: newId(), taskId, text: t, sort: (r[0]?.m ?? 0) + 1 });
    await db().update(schema.tasks).set({ lastActivityAt: new Date() }).where(eq(schema.tasks.id, taskId));
    void v;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleCheck(checkId: string, done: boolean): Promise<ActionResult> {
  try {
    const c = (await db().select().from(schema.taskChecks).where(eq(schema.taskChecks.id, checkId)).limit(1))[0];
    if (!c) return { ok: false, error: "That step no longer exists." };
    const { v } = await checkAccess(c.taskId);
    await db().update(schema.taskChecks).set({ done }).where(eq(schema.taskChecks.id, checkId));
    await log(c.taskId, v, "check", `${done ? "Ticked" : "Unticked"} “${c.text}”`);
    await db().update(schema.tasks).set({ lastActivityAt: new Date() }).where(eq(schema.tasks.id, c.taskId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCheck(checkId: string): Promise<ActionResult> {
  try {
    const c = (await db().select().from(schema.taskChecks).where(eq(schema.taskChecks.id, checkId)).limit(1))[0];
    if (!c) return { ok: true };
    await checkAccess(c.taskId);
    await db().delete(schema.taskChecks).where(eq(schema.taskChecks.id, checkId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setWatching(taskId: string, personId: string, on: boolean): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const task = await loadTask(taskId);
    const watchers = await watcherIds(taskId);
    const can = rights(org, v, task, watchers);
    // anyone who can see a task can watch it themselves; adding others needs edit rights
    if (personId !== v.personId && !can.update) return { ok: false, error: "You can't add watchers to this task." };
    if (personId === v.personId && !can.see && !on) return { ok: true };
    if (!org.byId.has(personId)) return { ok: false, error: "Unknown person." };
    if (on) {
      await db().insert(schema.taskWatchers).values({ taskId, personId }).onConflictDoNothing();
      if (personId !== v.personId) await notify([personId], { kind: "assigned", title: `${v.name} added you to T-${task.number}: ${task.title}`, link: link(task.number) });
    } else {
      await db().delete(schema.taskWatchers).where(and(eq(schema.taskWatchers.taskId, taskId), eq(schema.taskWatchers.personId, personId)));
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const task = await loadTask(taskId);
    if (v.role !== "admin" && task.createdBy !== v.personId) return { ok: false, error: "Only the person who created this task, or an admin, can delete it. Cancel it instead." };
    await db().delete(schema.taskUpdates).where(eq(schema.taskUpdates.taskId, taskId));
    await db().delete(schema.taskChecks).where(eq(schema.taskChecks.taskId, taskId));
    await db().delete(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, taskId));
    await db().delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    await logActivity(v, "delete", "task", taskId, `Deleted T-${task.number} ${task.title}`, { task });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function stopSeries(seriesId: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const s = (await db().select().from(schema.taskSeries).where(eq(schema.taskSeries.id, seriesId)).limit(1))[0];
    if (!s) return { ok: false, error: "This repeat no longer exists." };
    if (!(seesEverything(v) || s.createdBy === v.personId || canManage(org, v, s.ownerId) || s.ownerId === v.personId))
      return { ok: false, error: "You can't change this repeat." };
    await db().update(schema.taskSeries).set({ active: false, updatedAt: new Date() }).where(eq(schema.taskSeries.id, seriesId));
    await logActivity(v, "stop_repeat", "series", seriesId, `Stopped repeating “${s.title}”`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Several tasks at once from the list: finish, hand over, move date, or change priority. */
export async function bulkUpdate(
  taskIds: string[],
  change: { status?: "done" | "cancelled"; ownerId?: string; dueDate?: string; priority?: string },
): Promise<ActionResult<{ changed: number; skipped: number }>> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const rows = taskIds.length ? await db().select().from(schema.tasks).where(inArray(schema.tasks.id, taskIds.slice(0, 200))) : [];
    let changed = 0;
    let skipped = 0;
    for (const task of rows) {
      const can = rights(org, v, task, await watcherIds(task.id));
      const needsEdit = change.ownerId !== undefined || change.status === "cancelled" || change.priority !== undefined || change.dueDate !== undefined;
      if (!(needsEdit ? can.edit : can.update)) {
        skipped++;
        continue;
      }
      const r = await updateTaskInner(v, org, task, change);
      if (r) changed++;
      else skipped++;
    }
    await logActivity(v, "bulk", "task", null, `Changed ${changed} task${changed === 1 ? "" : "s"} at once`, { change });
    refresh();
    return { ok: true, data: { changed, skipped } };
  } catch (e) {
    return fail(e);
  }
}

async function updateTaskInner(v: Viewer, org: Org, task: Task, change: { status?: string; ownerId?: string; dueDate?: string; priority?: string }): Promise<boolean> {
  const set: Partial<Task> = {};
  if (change.status && change.status !== task.status) {
    set.status = change.status;
    set.completedAt = change.status === "done" ? new Date() : null;
    await log(task.id, v, "status", `Marked ${STATUS_LABEL[change.status as keyof typeof STATUS_LABEL].toLowerCase()}`, task.status, change.status);
  }
  if (change.ownerId && change.ownerId !== task.ownerId) {
    const owner = org.byId.get(change.ownerId);
    if (!owner || !owner.active) return false;
    set.ownerId = owner.id;
    set.departmentId = owner.departmentId;
    await log(task.id, v, "owner", `Handed to ${owner.name}`, org.byId.get(task.ownerId)?.name ?? "", owner.name);
    await notify([owner.id], { kind: "assigned", title: `${v.name} gave you T-${task.number}: ${task.title}`, link: link(task.number) }, v.personId);
  }
  if (change.dueDate && isISODate(change.dueDate) && change.dueDate !== task.dueDate) {
    set.dueDate = change.dueDate;
    if (task.dueDate && change.dueDate > task.dueDate && isOpen(task.status)) set.slips = task.slips + 1;
    await log(task.id, v, "due", `Due date moved to ${formatDate(change.dueDate)}`, task.dueDate, change.dueDate);
  }
  if (change.priority && isPriority(change.priority) && change.priority !== task.priority) {
    set.priority = change.priority;
    await log(task.id, v, "priority", `Priority set to ${PRIORITY_LABEL[change.priority].toLowerCase()}`, task.priority, change.priority);
  }
  if (!Object.keys(set).length) return false;
  await db().update(schema.tasks).set({ ...set, updatedAt: new Date(), lastActivityAt: new Date() }).where(eq(schema.tasks.id, task.id));
  return true;
}

export async function markAllRead(): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    if (v.personId) {
      const { isNull } = await import("drizzle-orm");
      await db()
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(and(eq(schema.notifications.personId, v.personId), isNull(schema.notifications.readAt)));
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markRead(id: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    if (v.personId)
      await db()
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(and(eq(schema.notifications.id, id), eq(schema.notifications.personId, v.personId)));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
