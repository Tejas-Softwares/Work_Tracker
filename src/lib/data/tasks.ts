import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, isNotNull, lt, lte, gte, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import type { Viewer } from "../auth/session";
import { getOrg, seesEverything, visibleIds, canManage, type Org } from "../org";
import { addDays, endOfWeek, monthEnd, monthOf, monthStart, startOfWeek, todayISO } from "../domain/dates";
import { OPEN_STATUSES, isPriority, isSource, isStatus } from "../domain/tasks";

const t = schema.tasks;

export type TaskRow = {
  id: string;
  number: number;
  title: string;
  ownerId: string;
  createdBy: string | null;
  departmentId: string | null;
  project: string;
  priority: string;
  status: string;
  dueDate: string | null;
  startDate: string | null;
  completedAt: Date | null;
  slips: number;
  source: string;
  initiativeId: string | null;
  meetingId: string | null;
  seriesId: string | null;
  blockedReason: string;
  lastActivityAt: Date;
  createdAt: Date;
  updates: number;
  checksDone: number;
  checksTotal: number;
};

export const taskColumns = {
  id: t.id,
  number: t.number,
  title: t.title,
  ownerId: t.ownerId,
  createdBy: t.createdBy,
  departmentId: t.departmentId,
  project: t.project,
  priority: t.priority,
  status: t.status,
  dueDate: t.dueDate,
  startDate: t.startDate,
  completedAt: t.completedAt,
  slips: t.slips,
  source: t.source,
  initiativeId: t.initiativeId,
  meetingId: t.meetingId,
  seriesId: t.seriesId,
  blockedReason: t.blockedReason,
  lastActivityAt: t.lastActivityAt,
  createdAt: t.createdAt,
  updates: sql<number>`(select count(*)::int from task_updates u where u.task_id = "tasks"."id" and u.kind = 'comment')`,
  checksDone: sql<number>`(select count(*)::int from task_checks c where c.task_id = "tasks"."id" and c.done)`,
  checksTotal: sql<number>`(select count(*)::int from task_checks c where c.task_id = "tasks"."id")`,
};

/** The rows a viewer may see: everything for management, otherwise their people, what they created and what they watch. */
export function visibilityWhere(org: Org, v: Viewer): SQL | undefined {
  if (seesEverything(v)) return undefined;
  const ids = [...visibleIds(org, v)];
  const parts: SQL[] = [];
  if (ids.length) parts.push(inArray(t.ownerId, ids));
  if (v.personId) {
    parts.push(eq(t.createdBy, v.personId));
    parts.push(sql`exists (select 1 from task_watchers w where w.task_id = "tasks"."id" and w.person_id = ${v.personId})`);
  }
  return parts.length ? or(...parts) : sql`false`;
}

export type TaskFilters = {
  q: string;
  owner: string; // "" | "me" | personId
  dept: string;
  status: string; // open | all | done | todo | in_progress | blocked | cancelled
  priority: string;
  due: string; // "" | overdue | today | week | next7 | month | none | late_done
  project: string;
  source: string;
  initiative: string;
  meeting: string;
  scope: string; // "" | mine | assigned_by_me | watching | team
  view: string; // list | board
  group: string; // due | owner | dept | project | status | none
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): TaskFilters {
  const g = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v ?? "").slice(0, 120);
  };
  return {
    q: g("q"),
    owner: g("owner"),
    dept: g("dept"),
    status: g("status") || "open",
    priority: g("priority"),
    due: g("due"),
    project: g("project"),
    source: g("source"),
    initiative: g("initiative"),
    meeting: g("meeting"),
    scope: g("scope"),
    view: g("view") === "board" ? "board" : "list",
    group: g("group") || "due",
  };
}

export async function listTasks(v: Viewer, f: TaskFilters, limit = 600): Promise<TaskRow[]> {
  const org = await getOrg();
  const today = todayISO();
  const where: (SQL | undefined)[] = [visibilityWhere(org, v)];

  if (f.q) {
    const num = Number(f.q.replace(/^t-?/i, ""));
    where.push(
      or(
        ilike(t.title, `%${f.q}%`),
        ilike(t.project, `%${f.q}%`),
        ilike(t.description, `%${f.q}%`),
        Number.isInteger(num) && num > 0 ? eq(t.number, num) : undefined,
      ),
    );
  }
  const owner = f.owner === "me" ? v.personId ?? "__none__" : f.owner;
  if (owner) where.push(eq(t.ownerId, owner));
  if (f.dept) where.push(eq(t.departmentId, f.dept));
  if (f.scope === "mine") where.push(eq(t.ownerId, v.personId ?? "__none__"));
  if (f.scope === "assigned_by_me") where.push(and(eq(t.createdBy, v.personId ?? "__none__"), ne(t.ownerId, v.personId ?? "__none__")));
  if (f.scope === "watching") where.push(sql`exists (select 1 from task_watchers w where w.task_id = "tasks"."id" and w.person_id = ${v.personId ?? "__none__"})`);
  if (f.scope === "team" && v.personId) {
    const ids = [...visibleIds(org, v)].filter((id) => id !== v.personId);
    where.push(ids.length ? inArray(t.ownerId, ids) : sql`false`);
  }

  if (f.status === "open") where.push(inArray(t.status, OPEN_STATUSES));
  else if (f.status === "done") where.push(eq(t.status, "done"));
  else if (isStatus(f.status)) where.push(eq(t.status, f.status));

  if (isPriority(f.priority)) where.push(eq(t.priority, f.priority));
  if (f.project) where.push(eq(t.project, f.project));
  if (isSource(f.source)) where.push(eq(t.source, f.source));
  if (f.initiative) where.push(eq(t.initiativeId, f.initiative));
  if (f.meeting) where.push(eq(t.meetingId, f.meeting));

  switch (f.due) {
    case "overdue":
      where.push(and(lt(t.dueDate, today), inArray(t.status, OPEN_STATUSES)));
      break;
    case "today":
      where.push(eq(t.dueDate, today));
      break;
    case "week":
      where.push(and(gte(t.dueDate, startOfWeek(today)), lte(t.dueDate, endOfWeek(today))));
      break;
    case "next7":
      where.push(and(gte(t.dueDate, today), lte(t.dueDate, addDays(today, 7))));
      break;
    case "month":
      where.push(and(gte(t.dueDate, monthStart(monthOf(today))), lte(t.dueDate, monthEnd(monthOf(today)))));
      break;
    case "none":
      where.push(isNull(t.dueDate));
      break;
    case "late_done":
      where.push(and(eq(t.status, "done"), isNotNull(t.dueDate), sql`(${t.completedAt} at time zone 'Asia/Kolkata')::date > ${t.dueDate}`));
      break;
  }

  const order =
    f.status === "done"
      ? [desc(t.completedAt)]
      : [sql`${t.dueDate} asc nulls last`, sql`case ${t.priority} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`, asc(t.number)];

  return (await db()
    .select(taskColumns)
    .from(t)
    .where(and(...where))
    .orderBy(...order)
    .limit(limit)) as TaskRow[];
}

/** Board: open tasks plus anything finished in the last 7 days. */
export async function boardTasks(v: Viewer, f: TaskFilters): Promise<TaskRow[]> {
  const open = await listTasks(v, { ...f, status: "open" });
  const recent = await listTasks(v, { ...f, status: "done" }, 200);
  const since = Date.now() - 7 * 86_400_000;
  return [...open, ...recent.filter((r) => r.completedAt && r.completedAt.getTime() >= since)];
}

export async function projectsInUse(v: Viewer): Promise<string[]> {
  const org = await getOrg();
  const rows = await db()
    .selectDistinct({ project: t.project })
    .from(t)
    .where(and(visibilityWhere(org, v), ne(t.project, "")))
    .orderBy(asc(t.project))
    .limit(200);
  return rows.map((r) => r.project);
}

export type TaskDetail = {
  task: typeof schema.tasks.$inferSelect;
  updates: (typeof schema.taskUpdates.$inferSelect)[];
  checks: (typeof schema.taskChecks.$inferSelect)[];
  watcherIds: string[];
  series: typeof schema.taskSeries.$inferSelect | null;
  initiative: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  meeting: { id: string; title: string; heldOn: string } | null;
  kra: { id: string; title: string } | null;
  can: { edit: boolean; update: boolean; delete: boolean };
};

export async function getTaskByNumber(v: Viewer, number: number): Promise<TaskDetail | null> {
  const org = await getOrg();
  const row = (await db().select().from(t).where(eq(t.number, number)).limit(1))[0];
  if (!row) return null;
  const watchers = await db().select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, row.id));
  const watcherIds = watchers.map((w) => w.personId);
  const isOwner = !!v.personId && row.ownerId === v.personId;
  const isCreator = !!v.personId && row.createdBy === v.personId;
  const manages = canManage(org, v, row.ownerId);
  const visible = seesEverything(v) || isOwner || isCreator || manages || (!!v.personId && watcherIds.includes(v.personId));
  if (!visible) return null;

  const [updates, checks, series, initiative, milestone, meeting, kra] = await Promise.all([
    db().select().from(schema.taskUpdates).where(eq(schema.taskUpdates.taskId, row.id)).orderBy(asc(schema.taskUpdates.createdAt)),
    db().select().from(schema.taskChecks).where(eq(schema.taskChecks.taskId, row.id)).orderBy(asc(schema.taskChecks.sort), asc(schema.taskChecks.createdAt)),
    row.seriesId ? db().select().from(schema.taskSeries).where(eq(schema.taskSeries.id, row.seriesId)).limit(1) : Promise.resolve([]),
    row.initiativeId
      ? db().select({ id: schema.initiatives.id, name: schema.initiatives.name }).from(schema.initiatives).where(eq(schema.initiatives.id, row.initiativeId)).limit(1)
      : Promise.resolve([]),
    row.milestoneId
      ? db().select({ id: schema.milestones.id, name: schema.milestones.name }).from(schema.milestones).where(eq(schema.milestones.id, row.milestoneId)).limit(1)
      : Promise.resolve([]),
    row.meetingId
      ? db().select({ id: schema.meetings.id, title: schema.meetings.title, heldOn: schema.meetings.heldOn }).from(schema.meetings).where(eq(schema.meetings.id, row.meetingId)).limit(1)
      : Promise.resolve([]),
    row.kraId ? db().select({ id: schema.kras.id, title: schema.kras.title }).from(schema.kras).where(eq(schema.kras.id, row.kraId)).limit(1) : Promise.resolve([]),
  ]);

  const edit = seesEverything(v) || isCreator || manages;
  return {
    task: row,
    updates,
    checks,
    watcherIds,
    series: series[0] ?? null,
    initiative: initiative[0] ?? null,
    milestone: milestone[0] ?? null,
    meeting: meeting[0] ?? null,
    kra: kra[0] ?? null,
    can: { edit, update: edit || isOwner, delete: v.role === "admin" || isCreator },
  };
}

/** Counts for the navigation and My work. */
export async function myCounts(v: Viewer): Promise<{ overdue: number; today: number; blocked: number; unread: number }> {
  if (!v.personId) return { overdue: 0, today: 0, blocked: 0, unread: 0 };
  const today = todayISO();
  const r = await db()
    .select({
      overdue: sql<number>`count(*) filter (where ${t.dueDate} < ${today})::int`,
      today: sql<number>`count(*) filter (where ${t.dueDate} = ${today})::int`,
      blocked: sql<number>`count(*) filter (where ${t.status} = 'blocked')::int`,
    })
    .from(t)
    .where(and(eq(t.ownerId, v.personId), inArray(t.status, OPEN_STATUSES)));
  const n = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.personId, v.personId), isNull(schema.notifications.readAt)));
  return { overdue: r[0]?.overdue ?? 0, today: r[0]?.today ?? 0, blocked: r[0]?.blocked ?? 0, unread: n[0]?.n ?? 0 };
}
