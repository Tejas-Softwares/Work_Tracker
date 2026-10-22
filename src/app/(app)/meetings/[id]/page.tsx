import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, seesEverything } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { taskColumns, type TaskRow } from "@/lib/data/tasks";
import { statTasks, statsBy } from "@/lib/data/stats";
import { KIND_LABEL } from "@/lib/data/meetings";
import { addMonths, formatDay, formatDate, monthLabel, monthOf, monthStart, monthEnd, todayISO } from "@/lib/domain/dates";
import { isOverdue, OPEN_STATUSES } from "@/lib/domain/tasks";
import { rag, formatKpi } from "@/lib/domain/kpi";
import { Avatar, DueText, PageHeader, StatusPill } from "@/components/ui/bits";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { toItem } from "@/components/tasks/types";
import { MeetingRecord } from "@/components/meetings/MeetingRecord";

const SOURCE_FOR: Record<string, string> = {
  huddle: "huddle",
  project_review: "project_review",
  management_review: "management_review",
  monthly_review: "monthly_review",
  one_to_one: "one_to_one",
  quarterly_review: "one_to_one",
  other: "other",
};

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ open?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await requireViewer();
  const org = await getOrg();
  const m = (await db().select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1))[0];
  if (!m) notFound();
  const canEdit = seesEverything(v) || m.chairPersonId === v.personId || m.createdBy === v.personId || (!!v.personId && m.attendeeIds.includes(v.personId));
  if (!canEdit && !seesEverything(v)) notFound();
  const today = todayISO();
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));
  const present = m.attendeeIds.filter((a) => !m.absentIds.includes(a));

  // Actions from this meeting, and open actions from the previous one of the same rhythm
  const actions = (await db().select(taskColumns).from(schema.tasks).where(eq(schema.tasks.meetingId, m.id)).orderBy(asc(schema.tasks.number))) as TaskRow[];
  const prevMeeting = m.rhythmId
    ? (await db().select().from(schema.meetings).where(and(eq(schema.meetings.rhythmId, m.rhythmId), lt(schema.meetings.heldOn, m.heldOn))).orderBy(desc(schema.meetings.heldOn)).limit(1))[0]
    : m.kind === "one_to_one"
      ? (
          await db()
            .select()
            .from(schema.meetings)
            .where(and(eq(schema.meetings.kind, "one_to_one"), lt(schema.meetings.heldOn, m.heldOn), ne(schema.meetings.id, m.id)))
            .orderBy(desc(schema.meetings.heldOn))
            .limit(20)
        ).find((x) => x.attendeeIds.length === m.attendeeIds.length && x.attendeeIds.every((a) => m.attendeeIds.includes(a)))
      : undefined;
  const carried = prevMeeting
    ? ((await db()
        .select(taskColumns)
        .from(schema.tasks)
        .where(and(eq(schema.tasks.meetingId, prevMeeting.id), inArray(schema.tasks.status, OPEN_STATUSES)))
        .orderBy(asc(schema.tasks.dueDate))) as TaskRow[])
    : [];

  // Agenda from the tracker
  let agenda: React.ReactNode = null;
  if (m.kind === "huddle" || m.kind === "other" || m.kind === "project_review") {
    const who = m.attendeeIds.length ? m.attendeeIds : m.departmentId ? org.active.filter((p) => p.departmentId === m.departmentId).map((p) => p.id) : [];
    const rows = who.length
      ? ((await db()
          .select(taskColumns)
          .from(schema.tasks)
          .where(and(inArray(schema.tasks.ownerId, who), inArray(schema.tasks.status, OPEN_STATUSES)))
          .orderBy(asc(schema.tasks.dueDate))) as TaskRow[])
      : [];
    const hot = rows.filter((t) => t.status === "blocked" || (t.dueDate && t.dueDate <= today) || t.priority === "critical");
    if (m.kind === "project_review") {
      const byProject = new Map<string, TaskRow[]>();
      for (const t of rows) {
        const k = t.project || "No project";
        if (!byProject.has(k)) byProject.set(k, []);
        byProject.get(k)!.push(t);
      }
      agenda = (
        <section>
          <h2 className="section-title mb-1">Projects, one at a time</h2>
          <p className="mb-3 text-[13px] text-ink-2">For each project: schedule, budget against actual, material, billing. Late and blocked work first.</p>
          <div className="grid gap-3">
            {[...byProject.entries()]
              .sort((a, b) => b[1].filter((t) => isOverdue(t, today) || t.status === "blocked").length - a[1].filter((t) => isOverdue(t, today) || t.status === "blocked").length)
              .map(([proj, list]) => {
                const late = list.filter((t) => isOverdue(t, today));
                const blocked = list.filter((t) => t.status === "blocked");
                return (
                  <details key={proj} className="rounded-lg border border-line" open={late.length + blocked.length > 0}>
                    <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 font-semibold">{proj}</span>
                      <span className="num text-[12.5px] text-ink-2">
                        {list.length} open
                        {late.length ? <span className="text-phase-y">, {late.length} late</span> : ""}
                        {blocked.length ? <span className="text-phase-r">, {blocked.length} blocked</span> : ""}
                      </span>
                    </summary>
                    <AgendaTasks rows={list.slice(0, 15)} org={org} today={today} meetingId={m.id} />
                  </details>
                );
              })}
            {!byProject.size && <p className="text-[13.5px] text-ink-3">No open project tasks for the people in this meeting.</p>}
          </div>
        </section>
      );
    } else {
      agenda = (
        <section>
          <h2 className="section-title mb-1">Round the room</h2>
          <p className="mb-3 text-[13px] text-ink-2">Each person: what&apos;s late, what&apos;s due today, what&apos;s blocking them. Fix a date or owner on the spot; new work goes in as an action below.</p>
          <div className="grid gap-2">
            {who.map((pid) => {
              const p = org.byId.get(pid);
              if (!p) return null;
              const mineHot = hot.filter((t) => t.ownerId === pid);
              const openN = rows.filter((t) => t.ownerId === pid).length;
              return (
                <details key={pid} className="rounded-lg border border-line" open={mineHot.length > 0}>
                  <summary className="flex cursor-pointer items-center gap-3 px-4 py-2">
                    <Avatar name={p.name} size={24} />
                    <span className={m.absentIds.includes(pid) ? "flex-1 font-semibold text-ink-3 line-through" : "flex-1 font-semibold"}>{p.name}</span>
                    <span className="num text-[12.5px] text-ink-2">
                      {openN} open
                      {mineHot.filter((t) => isOverdue(t, today)).length ? <span className="text-phase-y">, {mineHot.filter((t) => isOverdue(t, today)).length} late</span> : ""}
                      {mineHot.filter((t) => t.status === "blocked").length ? <span className="text-phase-r">, {mineHot.filter((t) => t.status === "blocked").length} blocked</span> : ""}
                    </span>
                  </summary>
                  {mineHot.length ? <AgendaTasks rows={mineHot} org={org} today={today} meetingId={m.id} showOwner={false} /> : <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-3">Nothing late, due today or blocked.</p>}
                </details>
              );
            })}
            {!who.length && <p className="text-[13.5px] text-ink-3">Add the people at this meeting to see their work here.</p>}
          </div>
        </section>
      );
    }
  } else if (m.kind === "management_review" || m.kind === "monthly_review") {
    const month = monthOf(today);
    const reviewMonth = m.kind === "monthly_review" ? addMonths(month, -1) : month;
    const ids = org.active.filter((p) => !p.isVacancy).map((p) => p.id);
    const [tasks, kpis, vals, cards, inits, ms] = await Promise.all([
      statTasks(ids, monthStart(reviewMonth)),
      db().select().from(schema.kpis).where(eq(schema.kpis.active, true)).orderBy(asc(schema.kpis.sort)),
      db().select().from(schema.kpiValues).where(eq(schema.kpiValues.month, reviewMonth)),
      db().select().from(schema.scorecards).where(eq(schema.scorecards.month, reviewMonth)),
      db().select().from(schema.initiatives).where(inArray(schema.initiatives.status, ["active", "planned"])),
      db().select().from(schema.milestones).where(eq(schema.milestones.status, "pending")).orderBy(asc(schema.milestones.dueDate)),
    ]);
    const byDept = statsBy(tasks, (t) => t.departmentId ?? "", monthStart(reviewMonth), monthEnd(reviewMonth), today);
    const blocked = (await db().select(taskColumns).from(schema.tasks).where(eq(schema.tasks.status, "blocked")).orderBy(asc(schema.tasks.dueDate)).limit(12)) as TaskRow[];
    const scored = cards.filter((c) => c.status !== "draft");
    const low = scored.filter((c) => c.overall !== null && Number(c.overall) < 3);
    agenda = (
      <section className="grid gap-5">
        <div>
          <h2 className="section-title mb-1">{m.kind === "monthly_review" ? `${monthLabel(reviewMonth, true)} by department` : "Departments this month"}</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="num">Open</th>
                  <th className="num">Overdue now</th>
                  <th className="num">On time</th>
                  <th>KPIs off target</th>
                </tr>
              </thead>
              <tbody>
                {org.departments
                  .filter((d) => d.active)
                  .map((d) => {
                    const s = byDept.get(d.id);
                    const off = kpis
                      .filter((k) => k.departmentId === d.id)
                      .map((k) => ({ k, val: vals.find((x) => x.kpiId === k.id) }))
                      .filter(({ k, val }) => val && rag(Number(val.value), k.target === null ? null : Number(k.target), k.direction) === "red");
                    return (
                      <tr key={d.id}>
                        <td className="font-[550]">{d.name}</td>
                        <td className="num">{s?.open ?? 0}</td>
                        <td className="num" style={{ color: s?.overdueNow ? "var(--color-phase-y)" : undefined }}>
                          {s?.overdueNow ?? 0}
                        </td>
                        <td className="num">{s?.onTimePct == null ? "–" : `${s.onTimePct}%`}</td>
                        <td className="text-[13px]">
                          {off.length ? (
                            off.map(({ k, val }) => (
                              <span key={k.id} className="mr-2 inline-block">
                                <span className="text-phase-r">{k.name}</span> {formatKpi(Number(val!.value), k.unit)}
                              </span>
                            ))
                          ) : (
                            <span className="text-ink-3">none</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            <Link href={`/kpis?month=${reviewMonth}`} className="link">
              All KPIs for {monthLabel(reviewMonth)}
            </Link>
            {" · "}
            <Link href="/dashboard" className="link">
              Dashboard
            </Link>
          </p>
        </div>
        {blocked.length > 0 && (
          <div>
            <h2 className="section-title mb-2">Blocked ({blocked.length}): decide or unblock</h2>
            <AgendaTasks rows={blocked} org={org} today={today} meetingId={m.id} />
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="section-title mb-2">Initiative gates coming up</h2>
            <ul className="grid gap-1.5 text-[13.5px]">
              {ms
                .filter((x) => inits.some((i) => i.id === x.initiativeId))
                .slice(0, 6)
                .map((x) => (
                  <li key={x.id} className="flex justify-between gap-3">
                    <Link className="hover:text-brand" href={`/initiatives/${x.initiativeId}`}>
                      {x.name}
                    </Link>
                    <span className="num text-ink-2" style={{ color: x.dueDate && x.dueDate < today ? "var(--color-phase-y)" : undefined }}>
                      {x.dueDate ? formatDate(x.dueDate, today) : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          {m.kind === "monthly_review" && (
            <div>
              <h2 className="section-title mb-2">Scorecards for {monthLabel(reviewMonth)}</h2>
              <p className="text-[13.5px]">
                {scored.length} of {org.active.filter((p) => !p.isVacancy && p.reportsTo).length} shared. {low.length ? `${low.length} below 3.` : ""}
              </p>
              <Link className="link text-[13px]" href={`/scorecards?month=${reviewMonth}`}>
                Open scorecards
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  } else if (m.kind === "one_to_one" || m.kind === "quarterly_review") {
    const other = m.attendeeIds.find((a) => a !== m.chairPersonId) ?? m.attendeeIds[0];
    const p = other ? org.byId.get(other) : undefined;
    if (p) {
      const [kras, open, card] = await Promise.all([
        db().select().from(schema.kras).where(and(eq(schema.kras.personId, p.id), eq(schema.kras.active, true))).orderBy(asc(schema.kras.sort)),
        db().select(taskColumns).from(schema.tasks).where(and(eq(schema.tasks.ownerId, p.id), inArray(schema.tasks.status, OPEN_STATUSES))).orderBy(asc(schema.tasks.dueDate)) as Promise<TaskRow[]>,
        db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, p.id), ne(schema.scorecards.status, "draft"))).orderBy(desc(schema.scorecards.month)).limit(1),
      ]);
      const c = card[0];
      agenda = (
        <section className="grid gap-5">
          <div>
            <h2 className="section-title mb-2">{p.name}&apos;s KRAs</h2>
            <ul className="grid gap-1.5 text-[13.5px]">
              {kras.map((k) => (
                <li key={k.id} className="grid grid-cols-[1fr_auto] gap-3">
                  <span>
                    <b className="font-[550]">{k.title}</b>
                    {k.target && <span className="text-ink-3">: {k.target}</span>}
                  </span>
                  <span className="num text-ink-3">{c?.kraScores[k.id]?.score ? `last ${c.kraScores[k.id].score}/5` : ""}</span>
                </li>
              ))}
              {!kras.length && <li className="text-ink-3">No KRAs yet. Agree them now and add them on the role card.</li>}
            </ul>
            {c && (
              <p className="mt-2 text-[13px] text-ink-2">
                Last scorecard: {monthLabel(c.month)}, {Number(c.overall).toFixed(2)}.{c.improve ? ` To improve: ${c.improve}` : ""}
              </p>
            )}
          </div>
          <div>
            <h2 className="section-title mb-2">Open work ({open.length})</h2>
            <AgendaTasks rows={open.slice(0, 15)} org={org} today={today} meetingId={m.id} showOwner={false} />
          </div>
        </section>
      );
    }
  }

  const open = Number(sp.open);
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        back={{ href: "/meetings", label: "Meetings" }}
        title={m.title}
        sub={`${KIND_LABEL[m.kind]}, ${formatDay(m.heldOn, today)}${m.chairPersonId ? `, chaired by ${org.byId.get(m.chairPersonId)?.name}` : ""}. ${present.length} of ${m.attendeeIds.length} present.`}
        actions={
          <>
            <NewTaskButton defaults={{ meetingId: m.id, source: SOURCE_FOR[m.kind], context: m.title }} label="Add action" />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-6">
          {carried.length > 0 && prevMeeting && (
            <section>
              <h2 className="section-title mb-1">Still open from {formatDate(prevMeeting.heldOn, today)}</h2>
              <p className="mb-2 text-[13px] text-ink-2">Actions agreed last time that aren&apos;t finished. Check each one first.</p>
              <Suspense>
                <TaskList items={carried.map((r) => toItem(r, org))} today={today} people={people} group="none" compact emptyText="" />
              </Suspense>
            </section>
          )}
          {agenda}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="section-title">Actions from this meeting ({actions.length})</h2>
              <NewTaskButton defaults={{ meetingId: m.id, source: SOURCE_FOR[m.kind], context: m.title }} label="Add action" className="btn btn-sm" />
            </div>
            <Suspense>
              <TaskList items={actions.map((r) => toItem(r, org))} today={today} people={people} group="none" compact emptyText="No actions yet. Every decision that needs doing gets an owner and a date here." />
            </Suspense>
          </section>
        </div>
        <aside className="grid content-start gap-4">
          <MeetingRecord
            id={m.id}
            canEdit={canEdit}
            notes={m.notes}
            decisions={m.decisions}
            attendees={m.attendeeIds.map((a) => ({ id: a, name: org.byId.get(a)?.name ?? "Unknown" }))}
            absentIds={m.absentIds}
            people={people}
            canDelete={v.role === "admin" || m.createdBy === v.personId}
          />
        </aside>
      </div>
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref={`/meetings/${m.id}`} />}
    </div>
  );
}

function AgendaTasks({ rows, org, today, meetingId, showOwner = true }: { rows: TaskRow[]; org: Awaited<ReturnType<typeof getOrg>>; today: string; meetingId: string; showOwner?: boolean }) {
  if (!rows.length) return <p className="px-4 py-2.5 text-[13px] text-ink-3">Nothing to raise.</p>;
  return (
    <ul className="border-t border-line">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
          <Link href={`/meetings/${meetingId}?open=${t.number}`} scroll={false} className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-[550] hover:text-brand">{t.title}</span>
            <span className="block truncate text-[12px] text-ink-3">
              T-{t.number}
              {t.project ? `, ${t.project}` : ""}
              {t.status === "blocked" && t.blockedReason ? <span className="text-phase-r">, {t.blockedReason}</span> : ""}
            </span>
          </Link>
          {t.status === "blocked" ? <StatusPill status="blocked" small /> : null}
          {showOwner && <span className="hidden truncate text-[12.5px] text-ink-3 sm:inline">{org.byId.get(t.ownerId)?.name}</span>}
          <span className="w-[80px] text-right text-[13px]">
            <DueText due={t.dueDate} status={t.status} today={today} />
          </span>
        </li>
      ))}
    </ul>
  );
}

