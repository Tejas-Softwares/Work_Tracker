import { and, gte, inArray } from "drizzle-orm";
import { currentViewer } from "@/lib/auth/session";
import { getOrg, isHR, seesEverything, visibleIds } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { statTasks, statsBy } from "@/lib/data/stats";
import { addDays, diffDays, formatDate, isoDate, startOfWeek, todayISO } from "@/lib/domain/dates";
import { isOpen, isOverdue, STATUS_LABEL } from "@/lib/domain/tasks";
import { addTable, newBook, xlsxResponse } from "@/lib/excel/reports";

/** The weekly management report: by department, by person, overdue, blocked, finished this week. */
export async function GET(request: Request) {
  const v = await currentViewer();
  if (!v) return new Response("Sign in first.", { status: 401 });
  const dept = new URL(request.url).searchParams.get("dept") ?? "";
  const org = await getOrg();
  const today = todayISO();
  const from = startOfWeek(today);
  const scope = seesEverything(v) || isHR(v) ? new Set(org.people.map((p) => p.id)) : visibleIds(org, v);
  const people = org.active.filter((p) => scope.has(p.id) && !p.isVacancy && (!dept || p.departmentId === dept));
  const ids = people.map((p) => p.id);
  const tasks = await statTasks(ids, addDays(from, -7));
  const week = statsBy(tasks, (t) => t.ownerId, from, addDays(from, 6), today);
  const lastWeek = statsBy(tasks, (t) => t.ownerId, addDays(from, -7), addDays(from, -1), today);
  const detail = ids.length
    ? await db()
        .select({ number: schema.tasks.number, title: schema.tasks.title, ownerId: schema.tasks.ownerId, project: schema.tasks.project, dueDate: schema.tasks.dueDate, status: schema.tasks.status, blockedReason: schema.tasks.blockedReason, completedAt: schema.tasks.completedAt })
        .from(schema.tasks)
        .where(and(inArray(schema.tasks.ownerId, ids), inArray(schema.tasks.status, ["todo", "in_progress", "blocked", "done"])))
    : [];
  const updates = ids.length
    ? await db().select({ personId: schema.taskUpdates.authorPersonId }).from(schema.taskUpdates).where(and(inArray(schema.taskUpdates.authorPersonId, ids), gte(schema.taskUpdates.createdAt, new Date(`${from}T00:00:00+05:30`))))
    : [];
  const logged = new Map<string, number>();
  for (const u of updates) logged.set(u.personId!, (logged.get(u.personId!) ?? 0) + 1);

  const wb = newBook();
  const deptRows = org.departments
    .filter((d) => !dept || d.id === dept)
    .map((d) => {
      const mids = new Set(people.filter((p) => p.departmentId === d.id).map((p) => p.id));
      const dt = tasks.filter((t) => mids.has(t.ownerId));
      const open = dt.filter((t) => isOpen(t.status));
      const finished = dt.filter((t) => t.status === "done" && t.completedAt && isoDate(t.completedAt as Date) >= from).length;
      return [d.name, mids.size, open.length, open.filter((t) => isOverdue(t, today)).length, open.filter((t) => t.status === "blocked").length, finished];
    })
    .filter((r) => (r[1] as number) > 0);
  addTable(wb, "Departments", `Weekly report, week of ${formatDate(from, today)}`, [
    { header: "Department", width: 26 },
    { header: "People", width: 8 },
    { header: "Open", width: 8 },
    { header: "Overdue", width: 9 },
    { header: "Blocked", width: 9 },
    { header: "Finished this week", width: 12 },
  ], deptRows);
  addTable(
    wb,
    "People",
    `By person, week of ${formatDate(from, today)}`,
    [
      { header: "Person", width: 24 },
      { header: "Department", width: 22 },
      { header: "Open", width: 8 },
      { header: "Overdue", width: 9 },
      { header: "Finished this week", width: 12 },
      { header: "On time this week %", width: 12 },
      { header: "On time last week %", width: 12 },
      { header: "Updates logged this week", width: 12 },
    ],
    people.map((p) => {
      const mine = detail.filter((t) => t.ownerId === p.id && isOpen(t.status));
      return [
        p.name,
        p.departmentId ? org.deptById.get(p.departmentId)?.name ?? "" : "",
        mine.length,
        mine.filter((t) => isOverdue({ ...t, completedAt: null }, today)).length,
        week.get(p.id)?.doneInPeriod ?? 0,
        week.get(p.id)?.onTimePct ?? null,
        lastWeek.get(p.id)?.onTimePct ?? null,
        logged.get(p.id) ?? 0,
      ];
    }),
  );
  addTable(
    wb,
    "Overdue",
    "Overdue tasks, longest first",
    [
      { header: "No.", width: 8 },
      { header: "Task", width: 50 },
      { header: "Owner", width: 22 },
      { header: "Project", width: 18 },
      { header: "Due", width: 12 },
      { header: "Days late", width: 10 },
      { header: "Status", width: 12 },
    ],
    detail
      .filter((t) => isOpen(t.status) && t.dueDate && t.dueDate < today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((t) => [t.number, t.title, org.byId.get(t.ownerId)?.name ?? "", t.project, t.dueDate, diffDays(t.dueDate!, today), STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]]),
  );
  addTable(
    wb,
    "Blocked",
    "Blocked tasks and why",
    [
      { header: "No.", width: 8 },
      { header: "Task", width: 50 },
      { header: "Owner", width: 22 },
      { header: "Blocked by", width: 50 },
    ],
    detail.filter((t) => t.status === "blocked").map((t) => [t.number, t.title, org.byId.get(t.ownerId)?.name ?? "", t.blockedReason]),
  );
  return xlsxResponse(wb, `Tejas_Weekly_Report_${from}.xlsx`);
}

