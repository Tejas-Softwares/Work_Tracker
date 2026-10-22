import "server-only";
import { and, gte, inArray, isNotNull, lte, or, sql, ne, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { periodStats, type PeriodStats, type TaskLike } from "../domain/tasks";
import { buildMuster, type MusterRow } from "../domain/muster";
import { addDays, monthEnd, monthStart } from "../domain/dates";

export type StatTask = TaskLike & { ownerId: string; departmentId: string | null; id: string; number: number; title: string; lastActivityAt: Date };

/** Tasks that matter for stats: open ones, plus anything due or finished since `since`. */
export async function statTasks(personIds: string[] | null, since: string): Promise<StatTask[]> {
  const t = schema.tasks;
  const where = [
    ne(t.status, "cancelled"),
    or(inArray(t.status, ["todo", "in_progress", "blocked"]), gte(t.dueDate, since), gte(t.completedAt, new Date(`${since}T00:00:00+05:30`))),
  ];
  if (personIds) {
    if (!personIds.length) return [];
    where.push(inArray(t.ownerId, personIds));
  }
  return db()
    .select({
      id: t.id,
      number: t.number,
      title: t.title,
      ownerId: t.ownerId,
      departmentId: t.departmentId,
      status: t.status,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      priority: t.priority,
      slips: t.slips,
      lastActivityAt: t.lastActivityAt,
    })
    .from(t)
    .where(and(...where));
}

export function statsBy<K extends string>(tasks: StatTask[], keyOf: (t: StatTask) => K | null, from: string, to: string, today: string): Map<K, PeriodStats> {
  const groups = new Map<K, StatTask[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    if (k === null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const out = new Map<K, PeriodStats>();
  for (const [k, list] of groups) out.set(k, periodStats(list, from, to, today));
  return out;
}

export function monthStats(tasks: TaskLike[], month: string, today: string): PeriodStats {
  return periodStats(tasks, monthStart(month), monthEnd(month), today);
}

/** Work logged per person per day (updates written, tasks created, status changes, steps ticked). */
export async function musterFor(personIds: string[], days: string[]): Promise<MusterRow[]> {
  if (!personIds.length || !days.length) return [];
  const from = days[0];
  const to = days[days.length - 1];
  const rows = await db()
    .select({
      personId: schema.taskUpdates.authorPersonId,
      day: sql<string>`to_char(${schema.taskUpdates.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.taskUpdates)
    .where(
      and(
        isNotNull(schema.taskUpdates.authorPersonId),
        inArray(schema.taskUpdates.authorPersonId, personIds),
        gte(schema.taskUpdates.createdAt, new Date(`${from}T00:00:00+05:30`)),
        lte(schema.taskUpdates.createdAt, new Date(`${addDays(to, 1)}T00:00:00+05:30`)),
      ),
    )
    .groupBy(schema.taskUpdates.authorPersonId, sql`2`);
  const events = rows.flatMap((r) => Array.from({ length: r.n }, () => ({ personId: r.personId!, day: r.day })));
  return buildMuster(personIds, events, days);
}

/** Last time each person logged anything. */
export async function lastActive(personIds: string[]): Promise<Map<string, Date>> {
  if (!personIds.length) return new Map();
  const rows = await db()
    .select({ personId: schema.taskUpdates.authorPersonId, at: sql<Date>`max(${schema.taskUpdates.createdAt})` })
    .from(schema.taskUpdates)
    .where(inArray(schema.taskUpdates.authorPersonId, personIds))
    .groupBy(schema.taskUpdates.authorPersonId);
  return new Map(rows.map((r) => [r.personId!, new Date(r.at)]));
}

export async function sharedScores(personId: string, limit = 6) {
  return db()
    .select({ month: schema.scorecards.month, overall: schema.scorecards.overall, status: schema.scorecards.status })
    .from(schema.scorecards)
    .where(and(eq(schema.scorecards.personId, personId), ne(schema.scorecards.status, "draft")))
    .orderBy(sql`${schema.scorecards.month} desc`)
    .limit(limit);
}
