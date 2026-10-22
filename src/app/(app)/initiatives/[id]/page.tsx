import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, seesEverything } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { taskColumns, type TaskRow } from "@/lib/data/tasks";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { isOverdue } from "@/lib/domain/tasks";
import { PageHeader, SplitBar } from "@/components/ui/bits";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { toItem } from "@/components/tasks/types";
import { Timeline } from "@/components/initiatives/Timeline";
import { Milestones } from "@/components/initiatives/Milestones";
import { InitiativeForm } from "@/components/initiatives/InitiativeForm";

const STATUS: Record<string, string> = { planned: "Planned", active: "Active", on_hold: "On hold", done: "Done" };

export default async function InitiativePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ open?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await requireViewer();
  const org = await getOrg();
  const i = (await db().select().from(schema.initiatives).where(eq(schema.initiatives.id, id)).limit(1))[0];
  if (!i) notFound();
  const today = todayISO();
  const [ms, tasks] = await Promise.all([
    db().select().from(schema.milestones).where(eq(schema.milestones.initiativeId, id)).orderBy(asc(schema.milestones.dueDate), asc(schema.milestones.sort)),
    db().select(taskColumns).from(schema.tasks).where(eq(schema.tasks.initiativeId, id)).orderBy(asc(schema.tasks.dueDate)) as Promise<TaskRow[]>,
  ]);
  const live = tasks.filter((t) => t.status !== "cancelled");
  const done = live.filter((t) => t.status === "done").length;
  const late = live.filter((t) => isOverdue(t, today)).length;
  const canEdit = seesEverything(v) || i.ownerPersonId === v.personId;
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));
  // milestone of each task isn't in taskColumns; look it up
  const msOf = new Map((await db().select({ id: schema.tasks.id, milestoneId: schema.tasks.milestoneId }).from(schema.tasks).where(eq(schema.tasks.initiativeId, id))).map((r) => [r.id, r.milestoneId]));
  const groups = ms.map((m) => ({ key: m.id, label: m.name, items: live.filter((t) => msOf.get(t.id) === m.id) }));
  const loose = live.filter((t) => !msOf.get(t.id));
  const open = Number(sp.open);
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        back={{ href: "/initiatives", label: "Initiatives" }}
        title={i.name}
        sub={`${STATUS[i.status]}${i.ownerPersonId ? `, owner ${org.byId.get(i.ownerPersonId)?.name}` : ""}${i.startDate && i.endDate ? `, ${formatDate(i.startDate, today)} to ${formatDate(i.endDate, today)}` : ""}`}
        actions={
          <>
            {canEdit && <InitiativeForm people={people} initiative={{ id: i.id, name: i.name, description: i.description, ownerPersonId: i.ownerPersonId, startDate: i.startDate ?? "", endDate: i.endDate ?? "", status: i.status }} />}
            <NewTaskButton defaults={{ initiativeId: i.id, context: i.name }} label="Add task" />
          </>
        }
      />
      {i.description && <p className="mb-5 max-w-3xl text-[14.5px] leading-relaxed text-ink-2">{i.description}</p>}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1">
          <SplitBar height={10} parts={[{ value: done, color: "var(--color-earth-mark)", label: "Done" }, { value: late, color: "var(--color-phase-y-mark)", label: "Late" }, { value: live.length - done - late, color: "var(--color-brand-line)", label: "To do" }]} />
        </div>
        <span className="num text-[13px] text-ink-2">
          {done} of {live.length} done{late ? <span className="text-phase-y">, {late} late</span> : ""}
        </span>
      </div>
      {i.startDate && i.endDate && ms.some((m) => m.dueDate) && (
        <section className="mb-6 rounded-lg border border-line p-4">
          <Timeline start={i.startDate} end={i.endDate} today={today} milestones={ms} />
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-5">
          {groups.map((g) =>
            g.items.length ? (
              <section key={g.key}>
                <h2 className="section-title mb-2">{g.label}</h2>
                <Suspense>
                  <TaskList items={g.items.map((r) => toItem(r, org))} today={today} people={people} group="none" compact />
                </Suspense>
              </section>
            ) : null,
          )}
          {loose.length > 0 && (
            <section>
              <h2 className="section-title mb-2">{ms.length ? "Not tied to a gate" : "Tasks"}</h2>
              <Suspense>
                <TaskList items={loose.map((r) => toItem(r, org))} today={today} people={people} group="none" compact />
              </Suspense>
            </section>
          )}
          {!live.length && <p className="text-[13.5px] text-ink-3">No tasks yet.</p>}
        </div>
        <aside>
          <Milestones
            initiativeId={i.id}
            initiativeName={i.name}
            canEdit={canEdit}
            today={today}
            milestones={ms.map((m) => {
              const ts = live.filter((t) => msOf.get(t.id) === m.id);
              return { id: m.id, name: m.name, dueDate: m.dueDate, criteria: m.criteria, status: m.status, tasks: ts.length, done: ts.filter((t) => t.status === "done").length, late: ts.filter((t) => isOverdue(t, today)).length };
            })}
          />
        </aside>
      </div>
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref={`/initiatives/${i.id}`} />}
    </div>
  );
}
