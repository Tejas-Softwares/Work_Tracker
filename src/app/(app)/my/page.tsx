import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, managedIds, displayName } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { listTasks, parseFilters, taskColumns, type TaskRow } from "@/lib/data/tasks";
import { statTasks, monthStats, sharedScores, musterFor } from "@/lib/data/stats";
import { compliance, cadenceText, KIND_LABEL } from "@/lib/data/meetings";
import { db, schema } from "@/lib/db";
import { formatDay, monthOf, todayISO, recentWorkingDays, monthLabel, addDays } from "@/lib/domain/dates";
import { isOverdue, OPEN_STATUSES } from "@/lib/domain/tasks";
import { band, BAND_LABEL } from "@/lib/domain/scoring";
import { Avatar, DueText, Empty, Figure } from "@/components/ui/bits";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { toItem } from "@/components/tasks/types";

export const metadata = { title: "My work" };

function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function MyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const today = todayISO();
  const me = v.personId ? org.byId.get(v.personId) : undefined;
  const open = Number(Array.isArray(sp.open) ? sp.open[0] : sp.open);
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title mb-4">
          {greeting()}, {v.name.split(" ")[0]}
        </h1>
        <Empty title="Your account isn't linked to the team list yet">
          Once an admin links your account to your name, your tasks, role card and scores appear here.
          {v.role === "admin" && (
            <>
              {" "}
              <Link className="link" href="/settings/access">
                Link it now
              </Link>
              .
            </>
          )}
        </Empty>
      </div>
    );
  }

  const month = monthOf(today);
  const team = [...managedIds(org, v)];
  const [mine, given, kras, myStatTasks, scores, rhythm, teamTasks, teamMuster] = await Promise.all([
    listTasks(v, { ...parseFilters({}), scope: "mine", status: "open" }),
    db()
      .select(taskColumns)
      .from(schema.tasks)
      .where(and(eq(schema.tasks.createdBy, me.id), ne(schema.tasks.ownerId, me.id), inArray(schema.tasks.status, OPEN_STATUSES)))
      .orderBy(asc(schema.tasks.dueDate))
      .limit(8) as Promise<TaskRow[]>,
    db().select().from(schema.kras).where(and(eq(schema.kras.personId, me.id), eq(schema.kras.active, true))).orderBy(asc(schema.kras.sort)),
    statTasks([me.id], `${month}-01`),
    sharedScores(me.id, 3),
    db().select().from(schema.meetingRhythm).where(eq(schema.meetingRhythm.active, true)),
    team.length ? statTasks(team, addDays(today, -1)) : Promise.resolve([]),
    team.length ? musterFor(team, recentWorkingDays(today, settings.rules.idleAfterDays, settings.rules.workingDays)) : Promise.resolve([]),
  ]);
  const ms = monthStats(myStatTasks, month, today);
  const items = mine.map((r) => toItem(r, org));
  const overdue = items.filter((t) => isOverdue(t, today)).length;
  const dueToday = items.filter((t) => t.dueDate === today).length;
  const blocked = items.filter((t) => t.status === "blocked").length;

  // meetings due today that this person chairs or belongs to
  const mine_rhythm = rhythm.filter((r) => r.chairPersonId === me.id || (r.departmentId && r.departmentId === me.departmentId));
  const meetingsToday = (await compliance(mine_rhythm, today, settings.rules.workingDays, 1)).filter((c) => c.dueToday);

  const teamOverdue = teamTasks.filter((t) => isOverdue(t, today));
  const teamBlocked = teamTasks.filter((t) => t.status === "blocked");
  const quiet = teamMuster.filter((r) => r.total === 0).map((r) => org.byId.get(r.personId)).filter((p) => p && !p.isVacancy);

  const sentence = [
    overdue ? `${overdue} overdue` : null,
    dueToday ? `${dueToday} due today` : null,
    blocked ? `${blocked} blocked` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-3">{formatDay(today, today)}</p>
          <h1 className="page-title mt-0.5">
            {greeting()}, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {items.length === 0 ? "Nothing open on your list." : sentence.length ? `You have ${sentence.join(", ")}, out of ${items.length} open.` : `${items.length} open, nothing late. Good.`}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="My tasks">
          <Suspense>
            <TaskList items={items} today={today} people={people} showOwner={false} emptyText="Nothing open. Add what you're working on with New task, or press N." />
          </Suspense>
          {given.length > 0 && (
            <div className="mt-8">
              <h2 className="section-title mb-2 flex items-baseline justify-between">
                Given by you, still open
                <Link href="/tasks?scope=assigned_by_me" className="link text-[13px] font-normal">
                  All
                </Link>
              </h2>
              <ul className="overflow-hidden rounded-lg border border-line">
                {given.map((t) => {
                  const o = org.byId.get(t.ownerId);
                  return (
                    <li key={t.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                      <Avatar name={o?.name ?? "?"} size={22} vacancy={o?.isVacancy} />
                      <Link href={`/my?open=${t.number}`} scroll={false} className="min-w-0 flex-1 truncate text-[13.5px] hover:text-brand">
                        {t.title}
                      </Link>
                      <span className="hidden text-[12.5px] text-ink-3 sm:inline">{o?.name}</span>
                      <span className="w-[80px] text-right text-[13px]">
                        <DueText due={t.dueDate} status={t.status} today={today} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <aside className="grid content-start gap-4">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{monthLabel(month, true)} so far</h2>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              <Figure value={ms.onTimePct === null ? "–" : `${ms.onTimePct}%`} label="On time" tone={ms.onTimePct !== null && ms.onTimePct < 70 ? "warn" : undefined} />
              <Figure value={ms.doneInPeriod} label="Finished" />
              <Figure value={ms.slips} label="Dates moved" tone={ms.slips > 2 ? "warn" : undefined} />
            </div>
            {scores.length > 0 && (
              <div className="border-t border-line px-4 py-3 text-[13px]">
                <span className="text-ink-3">Recent scores: </span>
                {scores.map((s, i) => (
                  <span key={s.month}>
                    {i > 0 && ", "}
                    <Link href={`/scorecards/${me.id}/${s.month}`} className="link">
                      {monthLabel(s.month)} {Number(s.overall).toFixed(1)}
                    </Link>
                    {s.overall !== null && i === 0 && <span className="text-ink-3"> ({BAND_LABEL[band(Number(s.overall))!]})</span>}
                  </span>
                ))}
              </div>
            )}
          </section>

          {meetingsToday.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Meetings today</h2>
              </div>
              <ul className="grid gap-0">
                {meetingsToday.map((c) => (
                  <li key={c.rhythm.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{c.rhythm.title}</div>
                      <div className="text-[12px] text-ink-3">
                        {KIND_LABEL[c.rhythm.kind]}, {cadenceText(c.rhythm)}
                      </div>
                    </div>
                    {c.heldToday ? (
                      <span className="chip bg-earth-wash text-earth">Held</span>
                    ) : c.rhythm.chairPersonId === me.id ? (
                      <Link className="btn btn-sm btn-primary" href={`/meetings/new?rhythm=${c.rhythm.id}`}>
                        Start
                      </Link>
                    ) : (
                      <span className="chip">{c.rhythm.time || "Today"}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {team.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">{v.role === "admin" || v.role === "management" ? "The office today" : "Your team today"}</h2>
                <Link className="link text-[13px]" href="/dashboard">
                  Dashboard
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 p-4">
                <Figure value={teamOverdue.length} label="Overdue" tone={teamOverdue.length ? "warn" : undefined} href="/tasks?scope=team&due=overdue" />
                <Figure value={teamBlocked.length} label="Blocked" tone={teamBlocked.length ? "danger" : undefined} href="/tasks?scope=team&status=blocked" />
                <Figure value={quiet.length} label={`Quiet ${settings.rules.idleAfterDays} days`} tone={quiet.length ? "warn" : undefined} href="/dashboard#muster" />
              </div>
              {quiet.length > 0 && (
                <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
                  No work logged by {quiet.slice(0, 4).map((p) => p!.name).join(", ")}
                  {quiet.length > 4 ? ` and ${quiet.length - 4} more` : ""}.
                </p>
              )}
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Your role</h2>
              <Link className="link text-[13px]" href={`/team/${me.id}`}>
                Role card
              </Link>
            </div>
            <div className="p-4">
              <p className="text-[13px] font-semibold text-ink-2">{displayName(me) === me.name ? me.designation : displayName(me)}</p>
              {me.rolePurpose && <p className="mt-1 text-[13.5px]">{me.rolePurpose}</p>}
              {kras.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {kras.map((k) => (
                    <li key={k.id} className="grid grid-cols-[1fr_auto] gap-2 text-[13px]">
                      <span>
                        <span className="font-[550]">{k.title}</span>
                        {k.target && <span className="block text-[12px] text-ink-3">{k.target}</span>}
                      </span>
                      <span className="num text-ink-3">{k.weight}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-ink-3">No KRAs yet. Your manager adds them on your role card.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref="/my" />}
    </div>
  );
}
