import { Suspense } from "react";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, managedIds } from "@/lib/org";
import { boardTasks, listTasks, parseFilters, projectsInUse } from "@/lib/data/tasks";
import { db, schema } from "@/lib/db";
import { asc } from "drizzle-orm";
import { todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/bits";
import { TaskFilters, type View } from "@/components/tasks/TaskFilters";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { toItem } from "@/components/tasks/types";

export const metadata = { title: "Tasks" };

type SP = Record<string, string | string[] | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const org = await getOrg();
  const f = parseFilters(sp);
  const manager = managedIds(org, v).size > 0;
  const [rows, projects, initiatives] = await Promise.all([
    f.view === "board" ? boardTasks(v, f) : listTasks(v, f),
    projectsInUse(v),
    db().select({ id: schema.initiatives.id, name: schema.initiatives.name }).from(schema.initiatives).orderBy(asc(schema.initiatives.name)),
  ]);
  const items = rows.map((r) => toItem(r, org));
  const today = todayISO();
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));

  const views: View[] = [
    { key: "all", label: manager ? "Everything I can see" : "All my tasks", params: {} },
    { key: "mine", label: "Mine", params: { scope: "mine" } },
    ...(manager ? [{ key: "team", label: "My team", params: { scope: "team" } }] : []),
    { key: "overdue", label: "Overdue", params: { due: "overdue" } },
    { key: "week", label: "Due this week", params: { due: "week" } },
    { key: "blocked", label: "Blocked", params: { status: "blocked" } },
    { key: "given", label: "Given by me", params: { scope: "assigned_by_me" } },
    { key: "watching", label: "Watching", params: { scope: "watching" } },
    { key: "done", label: "Done", params: { status: "done" } },
  ];

  const open = Number(Array.isArray(sp.open) ? sp.open[0] : sp.open);
  const closeParams = new URLSearchParams(Object.entries(sp).flatMap(([k, val]) => (k === "open" || val === undefined ? [] : [[k, Array.isArray(val) ? val[0] : val]])));
  const closeHref = `/tasks${closeParams.toString() ? `?${closeParams}` : ""}`;

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Tasks"
        sub={`${items.length} ${f.status === "done" ? "finished" : f.status === "all" ? "" : "open"} task${items.length === 1 ? "" : "s"}${items.length >= 600 ? " (first 600 shown; narrow the filters)" : ""}`}
      />
      <Suspense>
        <TaskFilters people={people} departments={org.departments.map((d) => ({ id: d.id, name: d.name }))} projects={projects} initiatives={initiatives} views={views} manager={manager} />
      </Suspense>
      <Suspense>
        {f.view === "board" ? (
          <TaskBoard items={items} today={today} />
        ) : (
          <TaskList items={items} today={today} group={f.group} people={people} showOwner={manager || f.scope !== "mine"} emptyText="No tasks match these filters." />
        )}
      </Suspense>
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref={closeHref} />}
    </div>
  );
}
