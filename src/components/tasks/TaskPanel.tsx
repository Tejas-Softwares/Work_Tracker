import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getTaskByNumber } from "@/lib/data/tasks";
import { getOrg, displayName } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/lib/db";
import { todayISO } from "@/lib/domain/dates";
import { describeRule } from "@/lib/domain/tasks";
import { TaskPanelClient, type PanelData } from "./TaskPanelClient";

/** The task panel that slides in over a list when the URL has ?open=<number>. */
export async function TaskPanel({ number, closeHref }: { number: number; closeHref: string }) {
  const v = await requireViewer();
  const [detail, org, settings] = await Promise.all([getTaskByNumber(v, number), getOrg(), getSettings()]);
  if (!detail) {
    return (
      <PanelFrame closeHref={closeHref}>
        <div className="p-6">
          <p className="font-semibold">T-{number} isn&apos;t available</p>
          <p className="mt-1 text-[13.5px] text-ink-2">It may have been deleted, or it belongs to someone outside your team.</p>
          <Link href={closeHref} className="btn mt-4" scroll={false}>
            Close
          </Link>
        </div>
      </PanelFrame>
    );
  }
  const t = detail.task;
  const [initiatives, milestones, kras] = await Promise.all([
    db().select({ id: schema.initiatives.id, name: schema.initiatives.name }).from(schema.initiatives).where(inArray(schema.initiatives.status, ["planned", "active", "on_hold"])).orderBy(asc(schema.initiatives.name)),
    t.initiativeId
      ? db().select({ id: schema.milestones.id, name: schema.milestones.name }).from(schema.milestones).where(eq(schema.milestones.initiativeId, t.initiativeId)).orderBy(asc(schema.milestones.sort))
      : Promise.resolve([]),
    db().select({ id: schema.kras.id, title: schema.kras.title }).from(schema.kras).where(eq(schema.kras.personId, t.ownerId)).orderBy(asc(schema.kras.sort)),
  ]);
  if (detail.initiative && !initiatives.some((i) => i.id === detail.initiative!.id)) initiatives.push(detail.initiative);

  const owner = org.byId.get(t.ownerId);
  const creator = t.createdBy ? org.byId.get(t.createdBy) : undefined;
  const data: PanelData = {
    id: t.id,
    number: t.number,
    title: t.title,
    description: t.description,
    status: t.status,
    blockedReason: t.blockedReason,
    priority: t.priority,
    ownerId: t.ownerId,
    ownerName: owner ? displayName(owner) : "Unknown",
    creatorName: creator?.name ?? "",
    createdAt: t.createdAt.toISOString(),
    dueDate: t.dueDate,
    originalDue: t.originalDue,
    slips: t.slips,
    completedAt: t.completedAt?.toISOString() ?? null,
    project: t.project,
    source: t.source,
    initiativeId: t.initiativeId,
    milestoneId: t.milestoneId,
    kraId: t.kraId,
    meeting: detail.meeting,
    series: detail.series ? { id: detail.series.id, text: describeRule(detail.series.rule), active: detail.series.active } : null,
    deptName: t.departmentId ? org.deptById.get(t.departmentId)?.name ?? "" : "",
    checks: detail.checks.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    updates: detail.updates.map((u) => ({ id: u.id, kind: u.kind, body: u.body, authorName: u.authorName, at: u.createdAt.toISOString() })),
    watchers: detail.watcherIds.map((id) => ({ id, name: org.byId.get(id)?.name ?? "Unknown" })),
    can: detail.can,
    me: v.personId,
    isOwner: v.personId === t.ownerId,
    requireSlipReason: settings.rules.requireSlipReason,
  };
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));
  return (
    <PanelFrame closeHref={closeHref}>
      <TaskPanelClient key={`${t.id}-${t.updatedAt.getTime()}`} data={data} people={people} initiatives={initiatives} milestones={milestones} kras={kras} today={todayISO()} closeHref={closeHref} />
    </PanelFrame>
  );
}

function PanelFrame({ children, closeHref }: { children: React.ReactNode; closeHref: string }) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Task">
      <Link href={closeHref} scroll={false} className="absolute inset-0 block bg-[rgb(26_34_56/0.18)]" aria-label="Close task" tabIndex={-1} />
      <div className="anim-slide absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col overflow-hidden border-l border-line bg-white shadow-[var(--shadow-pop)]">
        {children}
      </div>
    </div>
  );
}
