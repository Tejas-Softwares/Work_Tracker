import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { Mail, Phone } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, canManage, canSeeScores, isHR, managersOf, visibleIds, seesEverything } from "@/lib/org";
import { listTasks, parseFilters } from "@/lib/data/tasks";
import { statTasks, monthStats, musterFor } from "@/lib/data/stats";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/lib/db";
import { addMonths, monthLabel, monthOf, todayISO, recentWorkingDays, formatDate, weekdayShort } from "@/lib/domain/dates";
import { band, BAND_LABEL } from "@/lib/domain/scoring";
import { musterLevel } from "@/lib/domain/muster";
import { Avatar, Figure, Notice, PageHeader } from "@/components/ui/bits";
import { RoleCard } from "@/components/org/RoleCard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { toItem } from "@/components/tasks/types";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const p = org.byId.get(id);
  if (!p) notFound();
  const today = todayISO();
  const dept = p.departmentId ? org.deptById.get(p.departmentId) : undefined;
  const boss = p.reportsTo ? org.byId.get(p.reportsTo) : undefined;
  const reports = org.reports.get(p.id) ?? [];
  const self = v.personId === p.id;
  const manages = canManage(org, v, p.id);
  const seeWork = self || manages || visibleIds(org, v).has(p.id);
  const seeScores = canSeeScores(org, v, p.id);
  const editRole = manages || isHR(v);
  const tab = sp.tab ?? "role";

  const kras = await db().select().from(schema.kras).where(and(eq(schema.kras.personId, p.id), eq(schema.kras.active, true))).orderBy(asc(schema.kras.sort));
  const people = org.active.map((x) => ({ id: x.id, name: x.name, designation: x.designation, dept: x.departmentId ? org.deptById.get(x.departmentId)?.name : "", vacancy: x.isVacancy }));

  const month = monthOf(today);
  let work: React.ReactNode = null;
  if (tab === "work" && seeWork) {
    const [open, stat, muster] = await Promise.all([
      listTasks(v, { ...parseFilters({}), owner: p.id, status: "open" }),
      statTasks([p.id], `${addMonths(month, -2)}-01`),
      musterFor([p.id], recentWorkingDays(today, 20, settings.rules.workingDays)),
    ]);
    const months = [addMonths(month, -2), addMonths(month, -1), month];
    const days = recentWorkingDays(today, 20, settings.rules.workingDays);
    const row = muster[0];
    work = (
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {months.map((m) => {
            const s = monthStats(stat, m, today);
            return (
              <div key={m} className="panel p-4">
                <div className="mb-2 text-[12.5px] font-semibold text-ink-2">{monthLabel(m)}</div>
                <div className="grid grid-cols-3 gap-1">
                  <Figure value={s.onTimePct === null ? "–" : `${s.onTimePct}%`} label="On time" tone={s.onTimePct !== null && s.onTimePct < 70 ? "warn" : undefined} />
                  <Figure value={s.doneInPeriod} label="Finished" />
                  <Figure value={s.slips} label="Moved" />
                </div>
              </div>
            );
          })}
        </div>
        {row && (
          <section className="panel p-4">
            <h3 className="mb-2 text-[13px] font-semibold">Work logged, last 20 working days</h3>
            <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`Work logged on ${row.activeDays} of the last 20 working days`}>
              {row.counts.map((c, i) => (
                <span
                  key={days[i]}
                  title={`${weekdayShort(days[i])} ${formatDate(days[i], today)}: ${c} update${c === 1 ? "" : "s"}`}
                  className="block h-5 w-5 rounded-[3px]"
                  style={{ background: ["#ffffff", "#c6d1ee", "#7d93cf", "#3f5db0"][musterLevel(c)], border: c ? "none" : "1px solid var(--color-line-strong)" }}
                />
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">
              Active on {row.activeDays} of 20 working days{row.quietDays ? `; nothing logged for the last ${row.quietDays}` : ""}.
            </p>
          </section>
        )}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">Open tasks</h3>
            {(manages || self) && <NewTaskButton defaults={{ ownerId: p.id }} label={self ? "New task" : `Give ${p.name.split(" ")[0]} a task`} className="btn btn-sm" />}
          </div>
          <Suspense>
            <TaskList items={open.map((r) => toItem(r, org))} today={today} people={people} showOwner={false} emptyText="Nothing open." />
          </Suspense>
        </section>
      </div>
    );
  }

  let scoresView: React.ReactNode = null;
  if (tab === "scores" && seeScores) {
    const rows = await db().select().from(schema.scorecards).where(eq(schema.scorecards.personId, p.id)).orderBy(desc(schema.scorecards.month)).limit(24);
    const visibleRows = rows.filter((r) => r.status !== "draft" || manages || isHR(v));
    const plans = await db().select().from(schema.improvementPlans).where(eq(schema.improvementPlans.personId, p.id)).orderBy(desc(schema.improvementPlans.startDate));
    scoresView = (
      <div className="grid gap-4">
        {(manages || seesEverything(v)) && !self && (
          <div className="flex gap-2">
            <Link className="btn btn-primary btn-sm" href={`/scorecards/${p.id}/${addMonths(month, -1)}`}>
              Score {monthLabel(addMonths(month, -1))}
            </Link>
            <Link className="btn btn-sm" href={`/scorecards/${p.id}/${month}`}>
              Score {monthLabel(month)}
            </Link>
          </div>
        )}
        {visibleRows.length ? (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Score</th>
                  <th>Band</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const o = r.overall === null ? null : Number(r.overall);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link className="link" href={`/scorecards/${p.id}/${r.month}`}>
                          {monthLabel(r.month, true)}
                        </Link>
                      </td>
                      <td className="num font-semibold">{o === null ? "–" : o.toFixed(2)}</td>
                      <td style={{ color: o !== null && o < 3 ? "var(--color-phase-y)" : undefined }}>{o === null ? "" : BAND_LABEL[band(o)!]}</td>
                      <td className="text-ink-2">{r.status === "draft" ? "Draft (not shared)" : r.status === "shared" ? "Shared" : "Seen by them"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">No scores yet.</p>
        )}
        {plans.length > 0 && (isHR(v) || manages || self) && (
          <section>
            <h3 className="section-title mb-2">Improvement plans</h3>
            <ul className="grid gap-2">
              {plans.map((pl) => (
                <li key={pl.id}>
                  <Link href={`/plans/${pl.id}`} className="link">
                    {formatDate(pl.startDate, today)} to {formatDate(pl.endDate, today)}
                  </Link>{" "}
                  <span className="text-ink-3">{pl.status === "active" ? "running" : `closed: ${pl.outcome.replace("_", " ")}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const tabs = [
    ["role", "Role card"],
    ...(seeWork ? [["work", "Work"]] : []),
    ...(seeScores ? [["scores", "Scores"]] : []),
  ];
  const open = Number(sp.open);

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        back={{ href: "/team", label: "Team" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p.name} size={44} vacancy={p.isVacancy} />
            <span>
              {p.name}
              {p.isVacancy && <span className="ml-2 align-middle text-[14px] font-normal text-ink-3">new hire seat</span>}
            </span>
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {p.designation}
              {dept ? `, ${dept.name}` : ""}
            </span>
            {p.email && (
              <a className="inline-flex items-center gap-1 hover:text-brand" href={`mailto:${p.email}`}>
                <Mail size={14} /> {p.email}
              </a>
            )}
            {p.phone && (
              <a className="inline-flex items-center gap-1 hover:text-brand" href={`tel:${p.phone}`}>
                <Phone size={14} /> {p.phone}
              </a>
            )}
          </span>
        }
      />
      {!p.active && (
        <div className="mb-4">
          <Notice tone="warn">{p.name} is marked as left. Their history stays; they can&apos;t be given new tasks.</Notice>
        </div>
      )}
      <nav className="tabs mb-5" aria-label="Person">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/team/${p.id}${k === "role" ? "" : `?tab=${k}`}`} className="tab" aria-current={tab === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          {tab === "role" && (
            <RoleCard
              personId={p.id}
              purpose={p.rolePurpose}
              behaviours={p.behaviours}
              kras={kras.map((k) => ({ id: k.id, title: k.title, measure: k.measure, target: k.target, weight: k.weight }))}
              canEdit={editRole}
              designation={p.designation}
              reportsTo={boss ? `${boss.name}${boss.isVacancy ? " (new hire)" : ""}` : ""}
            />
          )}
          {tab === "work" && work}
          {tab === "scores" && scoresView}
        </div>
        <aside className="grid content-start gap-4 text-[13.5px]">
          <section>
            <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink-3">Reports to</h3>
            {boss ? (
              <Link href={`/team/${boss.id}`} className="flex items-center gap-2 hover:text-brand">
                <Avatar name={boss.name} size={24} vacancy={boss.isVacancy} /> {boss.name}
              </Link>
            ) : (
              <span className="text-ink-3">No one</span>
            )}
            {p.dottedLine && <p className="mt-1 text-[12.5px] text-ink-3">Dotted line to {p.dottedLine}</p>}
          </section>
          {managersOf(org, p.id).length > 1 && (
            <section>
              <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink-3">Chain above</h3>
              <p className="text-ink-2">
                {managersOf(org, p.id)
                  .slice(1)
                  .map((m) => m.name)
                  .join(", then ")}
              </p>
            </section>
          )}
          {reports.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink-3">Reports ({reports.length})</h3>
              <ul className="grid gap-1.5">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/team/${r.id}`} className="flex items-center gap-2 hover:text-brand">
                      <Avatar name={r.name} size={22} vacancy={r.isVacancy} />
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref={`/team/${p.id}?tab=work`} />}
    </div>
  );
}
