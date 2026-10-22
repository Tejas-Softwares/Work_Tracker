import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, desc } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, visibleIds, managedIds, seesEverything, isHR } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/lib/db";
import { statTasks, musterFor } from "@/lib/data/stats";
import { compliance, ordinal } from "@/lib/data/meetings";
import { addDays, addMonths, diffDays, formatDate, monthEnd, monthLabel, monthOf, monthStart, recentWorkingDays, startOfWeek, todayISO, weekdayShort, formatDay, isoDate } from "@/lib/domain/dates";
import { isOpen, isOverdue, periodStats } from "@/lib/domain/tasks";
import { rag } from "@/lib/domain/kpi";
import { Figure, PageHeader, SplitBar } from "@/components/ui/bits";
import { Columns, PercentLine } from "@/components/charts/Charts";
import { MusterRoll } from "@/components/charts/MusterRoll";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const all = seesEverything(v) || isHR(v);
  if (!all && managedIds(org, v).size === 0) redirect("/my");
  const today = todayISO();
  const month = monthOf(today);
  const wd = settings.rules.workingDays;

  const scopeIds = all ? new Set(org.people.map((p) => p.id)) : visibleIds(org, v);
  const dept = sp.dept && org.deptById.has(sp.dept) ? sp.dept : "";
  const people = org.active.filter((p) => scopeIds.has(p.id) && !p.isVacancy && (!dept || p.departmentId === dept));
  const ids = people.map((p) => p.id);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(startOfWeek(today), -7 * (7 - i)));
  const days = recentWorkingDays(today, 14, wd);

  const [tasks, muster, users, rhythm, kpis, kpiVals, inits, milestones, cards] = await Promise.all([
    statTasks(ids, weeks[0]),
    musterFor(ids, days),
    db().select({ personId: schema.users.personId }).from(schema.users).where(isNotNull(schema.users.personId)),
    db().select().from(schema.meetingRhythm).where(eq(schema.meetingRhythm.active, true)),
    db().select().from(schema.kpis).where(eq(schema.kpis.active, true)),
    db().select().from(schema.kpiValues).where(inArray(schema.kpiValues.month, [addMonths(month, -1), month])),
    db().select().from(schema.initiatives).where(inArray(schema.initiatives.status, ["active", "planned"])),
    db().select().from(schema.milestones),
    db().select().from(schema.scorecards).where(eq(schema.scorecards.month, addMonths(month, -1))),
  ]);
  const anyScores = (await db().select({ id: schema.scorecards.id }).from(schema.scorecards).limit(1)).length > 0;
  const linked = new Set(users.map((u) => u.personId));
  const open = tasks.filter((t) => isOpen(t.status));
  const overdue = open.filter((t) => isOverdue(t, today));
  const blocked = open.filter((t) => t.status === "blocked");
  const ms = periodStats(tasks, monthStart(month), monthEnd(month), today);
  const finishedWeek = tasks.filter((t) => t.status === "done" && t.completedAt && isoDate(t.completedAt as Date) >= startOfWeek(today)).length;
  const quiet = muster.filter((m) => m.quietDays >= settings.rules.idleAfterDays);

  // weekly trend
  const weekly = weeks.map((w) => {
    const end = addDays(w, 6);
    const s = periodStats(tasks, w, end, today);
    const label = w === startOfWeek(today) ? "This wk" : formatDate(w, today);
    return { key: w, label, finished: s.doneInPeriod, onTime: s.matured ? s.onTimePct : null, note: s.matured ? `${s.onTime} of ${s.matured} due tasks on time` : "Nothing due" };
  });

  // departments
  const deptRows = org.departments
    .filter((d) => d.active && (!dept || d.id === dept))
    .map((d) => {
      const members = people.filter((p) => p.departmentId === d.id);
      const mids = new Set(members.map((m) => m.id));
      const dt = tasks.filter((t) => mids.has(t.ownerId));
      const s = periodStats(dt, monthStart(month), monthEnd(month), today);
      const huddles = rhythm.filter((r) => r.departmentId === d.id && r.kind === "huddle");
      const k = kpis.filter((x) => x.departmentId === d.id);
      const rags = k.map((x) => {
        const val = kpiVals.find((kv) => kv.kpiId === x.id && kv.month === month) ?? kpiVals.find((kv) => kv.kpiId === x.id && kv.month === addMonths(month, -1));
        return val ? rag(Number(val.value), x.target === null ? null : Number(x.target), x.direction) : null;
      });
      return {
        d,
        people: members.length,
        open: dt.filter((t) => isOpen(t.status)).length,
        overdue: dt.filter((t) => isOverdue(t, today)).length,
        blocked: dt.filter((t) => t.status === "blocked").length,
        onTime: s.onTimePct,
        huddles,
        kpi: { green: rags.filter((r) => r === "green").length, amber: rags.filter((r) => r === "amber").length, red: rags.filter((r) => r === "red").length, none: rags.filter((r) => r === null).length },
      };
    })
    .filter((r) => r.people > 0 || r.open > 0);
  const huddleComp = await compliance(rhythm.filter((r) => r.kind === "huddle"), today, wd, 14);
  const compBy = new Map(huddleComp.map((c) => [c.rhythm.departmentId, c]));

  // people grid
  const openBy = new Map<string, { open: number; overdue: number }>();
  for (const t of open) {
    const o = openBy.get(t.ownerId) ?? { open: 0, overdue: 0 };
    o.open++;
    if (isOverdue(t, today)) o.overdue++;
    openBy.set(t.ownerId, o);
  }
  const musterPeople = muster.map((m) => {
    const p = org.byId.get(m.personId)!;
    return { id: p.id, name: p.name, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name ?? "" : "", counts: m.counts, quietDays: m.quietDays, activeDays: m.activeDays, open: openBy.get(p.id)?.open ?? 0, overdue: openBy.get(p.id)?.overdue ?? 0, linked: linked.has(p.id) };
  });
  const dayLabels = days.map((d) => ({ short: `${weekdayShort(d)[0]}${d.slice(8, 10).replace(/^0/, "")}`, full: formatDay(d, today), monday: weekdayShort(d) === "Mon" }));

  // initiatives
  const initRows = await Promise.all(
    inits.map(async (i) => {
      const t = await db().select({ status: schema.tasks.status, dueDate: schema.tasks.dueDate }).from(schema.tasks).where(eq(schema.tasks.initiativeId, i.id));
      const live = t.filter((x) => x.status !== "cancelled");
      const next = milestones.filter((m) => m.initiativeId === i.id && m.status === "pending").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))[0];
      return { i, done: live.filter((x) => x.status === "done").length, total: live.length, late: live.filter((x) => isOverdue({ ...x, completedAt: null }, today)).length, next };
    }),
  );
  const scoredIds = new Set(cards.filter((c) => c.status !== "draft").map((c) => c.personId));
  const toScore = people.filter((p) => p.reportsTo);
  const scored = toScore.filter((p) => scoredIds.has(p.id)).length;

  const topOverdue = [...overdue].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 12);
  const blockedRows = await db()
    .select({ number: schema.tasks.number, title: schema.tasks.title, ownerId: schema.tasks.ownerId, reason: schema.tasks.blockedReason, updatedAt: schema.tasks.updatedAt })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.status, "blocked"), ids.length ? inArray(schema.tasks.ownerId, ids) : eq(schema.tasks.id, "__none__")))
    .orderBy(desc(schema.tasks.updatedAt))
    .limit(10);

  return (
    <div className="mx-auto max-w-[1240px]">
      <PageHeader
        title={dept ? `${org.deptById.get(dept)?.name} dashboard` : all ? "Office dashboard" : "Team dashboard"}
        sub={`${people.length} people. Figures update as people work; on-time is for tasks due in ${monthLabel(month, true)} so far.`}
        actions={
          <form className="flex flex-wrap items-center gap-2" action="/dashboard">
            <select name="dept" defaultValue={dept} className="select w-full sm:w-[210px]" style={{ height: 34 }} aria-label="Department">
              <option value="">All departments</option>
              {org.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button className="btn">Show</button>
            <a className="btn" href={`/api/export/weekly${dept ? `?dept=${dept}` : ""}`}>
              Weekly report
            </a>
          </form>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-lg border border-line p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Figure value={open.length} label="Open tasks" href={`/tasks${dept ? `?dept=${dept}` : ""}`} />
        <Figure value={overdue.length} label={`Overdue${open.length ? ` (${Math.round((overdue.length / open.length) * 100)}% of open)` : ""}`} tone={overdue.length ? "warn" : undefined} href={`/tasks?due=overdue${dept ? `&dept=${dept}` : ""}`} />
        <Figure value={blocked.length} label="Blocked" tone={blocked.length ? "danger" : undefined} href={`/tasks?status=blocked${dept ? `&dept=${dept}` : ""}`} />
        <Figure value={ms.onTimePct === null ? "–" : `${ms.onTimePct}%`} label={`On time this month (${ms.onTime} of ${ms.matured})`} tone={ms.onTimePct !== null && ms.onTimePct < 70 ? "warn" : ms.onTimePct !== null && ms.onTimePct >= 90 ? "good" : undefined} />
        <Figure value={finishedWeek} label="Finished this week" />
        <Figure value={quiet.length} label={`No work logged ${settings.rules.idleAfterDays}+ days`} tone={quiet.length ? "warn" : undefined} href="#muster" />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="panel-title">Tasks finished per week</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Last 8 weeks, Monday to Sunday</p>
          <div className="pl-7">
            <Columns label="tasks finished" data={weekly.map((w) => ({ key: w.key, label: w.label, value: w.finished }))} />
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="panel-title">Delivered on time, by week due</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Share of tasks due that week finished on or before the date</p>
          <div className="pl-8">
            <PercentLine label="on time" target={90} data={weekly.map((w) => ({ key: w.key, label: w.label, value: w.onTime, note: w.note }))} />
          </div>
        </section>
      </div>

      <section className="mb-6">
        <h2 className="section-title mb-2">Departments</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">People</th>
                <th style={{ minWidth: 150 }}>Open work</th>
                <th className="num">Overdue</th>
                <th className="num">Blocked</th>
                <th className="num">On time</th>
                <th className="num">Huddles held</th>
                <th>KPIs</th>
              </tr>
            </thead>
            <tbody>
              {deptRows.map((r) => {
                const c = compBy.get(r.d.id);
                return (
                  <tr key={r.d.id}>
                    <td>
                      <Link className="font-[550] hover:text-brand" href={`/dashboard?dept=${r.d.id}`}>
                        {r.d.name}
                      </Link>
                    </td>
                    <td className="num">{r.people}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="num w-7 text-right text-[13px]">{r.open}</span>
                        <div className="w-24">
                          <SplitBar
                            parts={[
                              { value: r.open - r.overdue - r.blocked, color: "var(--color-phase-b)", label: "On track" },
                              { value: r.overdue, color: "var(--color-phase-y-mark)", label: "Overdue" },
                              { value: r.blocked, color: "var(--color-phase-r)", label: "Blocked" },
                            ]}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="num" style={{ color: r.overdue ? "var(--color-phase-y)" : undefined, fontWeight: r.overdue ? 600 : 400 }}>
                      <Link href={`/tasks?dept=${r.d.id}&due=overdue`}>{r.overdue}</Link>
                    </td>
                    <td className="num" style={{ color: r.blocked ? "var(--color-phase-r)" : undefined }}>
                      {r.blocked}
                    </td>
                    <td className="num">{r.onTime === null ? <span className="text-ink-3">–</span> : `${r.onTime}%`}</td>
                    <td className="num text-[13px]">{c ? <span style={{ color: c.due && c.held / c.due < 0.8 ? "var(--color-phase-y)" : undefined }}>{c.held} of {c.due}</span> : <span className="text-ink-3">no huddle</span>}</td>
                    <td className="text-[12.5px] whitespace-nowrap">
                      {r.kpi.green + r.kpi.amber + r.kpi.red === 0 ? (
                        <span className="text-ink-3">{r.kpi.none ? "no figures yet" : "none set"}</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <RagCount n={r.kpi.green} color="var(--color-earth-mark)" label="on target" />
                          <RagCount n={r.kpi.amber} color="var(--color-phase-y-mark)" label="close" />
                          <RagCount n={r.kpi.red} color="var(--color-phase-r)" label="off" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-3">Huddles held: daily huddles recorded in Meetings over the last 14 days, against working days.</p>
      </section>

      <section id="muster" className="mb-6 scroll-mt-20">
        <h2 className="section-title">Who logged work, last 14 working days</h2>
        <p className="mb-3 text-[13px] text-ink-2">Each square is a working day, shaded by updates logged: comments, status changes, steps ticked, tasks given. A blank row means nothing was recorded.</p>
        <MusterRoll people={musterPeople} days={days} dayLabels={dayLabels} idleAfter={settings.rules.idleAfterDays} />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Longest overdue</h2>
            <Link className="link text-[13px]" href={`/tasks?due=overdue${dept ? `&dept=${dept}` : ""}&group=owner`}>
              All {overdue.length}
            </Link>
          </div>
          {topOverdue.length ? (
            <ul>
              {topOverdue.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className="num w-[62px] shrink-0 text-[12.5px] font-semibold text-phase-y">{diffDays(t.dueDate!, today)} days</span>
                  <Link href={`/tasks?open=${t.number}`} className="min-w-0 flex-1 truncate text-[13.5px] hover:text-brand">
                    {t.title}
                  </Link>
                  <span className="truncate text-[12.5px] text-ink-3">{org.byId.get(t.ownerId)?.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13.5px] text-ink-3">Nothing overdue.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Blocked, and why</h2>
            <Link className="link text-[13px]" href={`/tasks?status=blocked${dept ? `&dept=${dept}` : ""}`}>
              All {blocked.length}
            </Link>
          </div>
          {blockedRows.length ? (
            <ul>
              {blockedRows.map((t) => (
                <li key={t.number} className="border-b border-line px-4 py-2 last:border-0">
                  <Link href={`/tasks?open=${t.number}`} className="block truncate text-[13.5px] font-[550] hover:text-brand">
                    {t.title}
                  </Link>
                  <span className="text-[12.5px] text-phase-r">{t.reason}</span>
                  <span className="text-[12.5px] text-ink-3">, {org.byId.get(t.ownerId)?.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13.5px] text-ink-3">Nothing blocked.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Initiatives</h2>
            <Link className="link text-[13px]" href="/initiatives">
              All
            </Link>
          </div>
          <ul>
            {initRows.map(({ i, done, total, late, next }) => (
              <li key={i.id} className="border-b border-line px-4 py-3 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/initiatives/${i.id}`} className="font-[550] hover:text-brand">
                    {i.name}
                  </Link>
                  <span className="num text-[12.5px] text-ink-2">
                    {done} of {total} done{late ? <span className="text-phase-y">, {late} late</span> : ""}
                  </span>
                </div>
                <div className="mt-1.5">
                  <SplitBar parts={[{ value: done, color: "var(--color-earth-mark)", label: "Done" }, { value: late, color: "var(--color-phase-y-mark)", label: "Late" }, { value: total - done - late, color: "var(--color-brand-line)", label: "To do" }]} />
                </div>
                {next && (
                  <p className="mt-1.5 text-[12.5px] text-ink-3">
                    Next gate: {next.name}
                    {next.dueDate ? `, ${formatDate(next.dueDate, today)}` : ""}
                  </p>
                )}
              </li>
            ))}
            {!initRows.length && <li className="px-4 py-6 text-center text-[13.5px] text-ink-3">No active initiatives.</li>}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Scorecards for {monthLabel(addMonths(month, -1), true)}</h2>
            <Link className="link text-[13px]" href={`/scorecards?month=${addMonths(month, -1)}`}>
              Open
            </Link>
          </div>
          {!anyScores ? (
            <p className="p-4 text-[13.5px] text-ink-2">No scorecards yet. The first month&apos;s scores are due by the {ordinal(settings.rules.scoreByDay)} of the month after.</p>
          ) : (
          <div className="p-4">
            <div className="mb-2 flex justify-between text-[13px]">
              <span>
                <b>{scored}</b> of {toScore.length} shared
              </span>
              <span className="text-ink-3">due by the {ordinal(settings.rules.scoreByDay)}</span>
            </div>
            <SplitBar height={8} parts={[{ value: scored, color: "var(--color-earth-mark)", label: "Shared" }, { value: toScore.length - scored, color: "var(--color-wash-2)", label: "Not yet" }]} />
          </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RagCount({ n, color, label }: { n: number; color: string; label: string }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1" title={`${n} ${label}`}>
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      <span className="num">{n}</span>
      <span className="text-ink-3">{label}</span>
    </span>
  );
}
