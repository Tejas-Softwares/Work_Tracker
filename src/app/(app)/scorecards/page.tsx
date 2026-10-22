import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, managedIds, isHR, seesEverything } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/lib/db";
import { statTasks, statsBy } from "@/lib/data/stats";
import { addMonths, isMonth, monthLabel, monthOf, monthStart, monthEnd, todayISO } from "@/lib/domain/dates";
import { band, BAND_LABEL, suggestsPlan } from "@/lib/domain/scoring";
import { onTimeToScore } from "@/lib/domain/tasks";
import { Avatar, Empty, Figure, Notice, PageHeader, SplitBar } from "@/components/ui/bits";
import { ordinal } from "@/lib/data/meetings";

export const metadata = { title: "Scorecards" };

export default async function ScorecardsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const today = todayISO();
  const thisMonth = monthOf(today);
  const month = isMonth(sp.month) && sp.month <= thisMonth ? sp.month : addMonths(thisMonth, Number(today.slice(8, 10)) <= settings.rules.scoreByDay ? -1 : 0);
  const all = isHR(v) || seesEverything(v);
  const scope = all ? org.active.filter((p) => !p.isVacancy) : org.active.filter((p) => managedIds(org, v).has(p.id) && !p.isVacancy);
  const me = v.personId ? org.byId.get(v.personId) : undefined;

  const ids = scope.map((p) => p.id);
  const [cards, prev, kraCounts, tasks] = await Promise.all([
    ids.length ? db().select().from(schema.scorecards).where(and(eq(schema.scorecards.month, month), inArray(schema.scorecards.personId, ids))) : Promise.resolve([]),
    ids.length ? db().select().from(schema.scorecards).where(and(eq(schema.scorecards.month, addMonths(month, -1)), inArray(schema.scorecards.personId, ids))) : Promise.resolve([]),
    ids.length ? db().select({ personId: schema.kras.personId }).from(schema.kras).where(and(eq(schema.kras.active, true), inArray(schema.kras.personId, ids))) : Promise.resolve([]),
    statTasks(ids, monthStart(month)),
  ]);
  const byPerson = new Map(cards.map((c) => [c.personId, c]));
  const prevBy = new Map(prev.map((c) => [c.personId, c]));
  const kraN = new Map<string, number>();
  for (const k of kraCounts) kraN.set(k.personId, (kraN.get(k.personId) ?? 0) + 1);
  const stats = statsBy(tasks, (t) => t.ownerId, monthStart(month), monthEnd(month), today);
  const done = scope.filter((p) => byPerson.get(p.id) && byPerson.get(p.id)!.status !== "draft").length;
  const drafts = scope.filter((p) => byPerson.get(p.id)?.status === "draft").length;
  const scored = cards.filter((c) => c.overall !== null && c.status !== "draft").map((c) => Number(c.overall));
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const flagged = scope.filter((p) =>
    suggestsPlan(
      [byPerson.get(p.id), prevBy.get(p.id)].filter(Boolean).map((c) => ({ month: c!.month, overall: c!.overall === null ? null : Number(c!.overall) })),
      month,
    ),
  );
  const myCard = me ? (await db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, me.id), eq(schema.scorecards.month, month))).limit(1))[0] : undefined;
  const dueBy = `${settings.rules.scoreByDay} ${monthLabel(addMonths(month, 1)).split(" ")[0]}`;

  const order = [...scope].sort((a, b) => {
    const da = a.departmentId ? org.deptById.get(a.departmentId)?.sort ?? 99 : 99;
    const dbb = b.departmentId ? org.deptById.get(b.departmentId)?.sort ?? 99 : 99;
    return da - dbb || a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Scorecards"
        sub={`Each person is scored monthly: KRAs count 70%, behaviours 30%. Scores for a month are due by the ${ordinal(settings.rules.scoreByDay)} of the next.`}
        actions={
          <div className="flex items-center gap-1">
            <Link className="btn btn-sm" href={`/scorecards?month=${addMonths(month, -1)}`} aria-label="Previous month">
              ‹
            </Link>
            <span className="min-w-[110px] text-center text-[14px] font-semibold">{monthLabel(month, true)}</span>
            {month < thisMonth && (
              <Link className="btn btn-sm" href={`/scorecards?month=${addMonths(month, 1)}`} aria-label="Next month">
                ›
              </Link>
            )}
            {ids.length > 0 && (
              <a className="btn btn-sm ml-2" href={`/api/export/scorecards?month=${month}`}>
                Excel
              </a>
            )}
          </div>
        }
      />

      {me && (myCard && myCard.status !== "draft" ? (
        <div className="mb-5">
          <Notice tone={myCard.status === "shared" ? "info" : "good"}>
            Your {monthLabel(month)} scorecard is {myCard.status === "shared" ? "ready to read" : "done"}.{" "}
            <Link className="font-semibold underline" href={`/scorecards/${me.id}/${month}`}>
              {myCard.status === "shared" ? "Read and acknowledge it" : "Open it"}
            </Link>
          </Notice>
        </div>
      ) : null)}

      {ids.length === 0 ? (
        <Empty title="No one to score">Scorecards appear here for the people who report to you. Your own scores show on your role card and here once your manager shares them.</Empty>
      ) : (
        <>
          <section className="mb-5 grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-2 flex items-baseline justify-between text-[13px]">
                <span>
                  <b>{done}</b> of {scope.length} shared{drafts ? `, ${drafts} in draft` : ""}
                </span>
                <span className="text-ink-3">due {dueBy}</span>
              </div>
              <SplitBar
                height={8}
                parts={[
                  { value: done, color: "var(--color-earth-mark)", label: "Shared" },
                  { value: drafts, color: "var(--color-brand-line)", label: "Draft" },
                  { value: scope.length - done - drafts, color: "var(--color-wash-2)", label: "Not started" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:w-[260px]">
              <Figure value={avg === null ? "–" : avg.toFixed(2)} label="Average shared score" />
              <Figure value={flagged.length} label="Below 3 two months running" tone={flagged.length ? "warn" : undefined} />
            </div>
          </section>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Department</th>
                  <th className="num">On time</th>
                  <th className="num">KRAs</th>
                  <th>Status</th>
                  <th className="num">Score</th>
                  <th className="num">Last month</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {order.map((p) => {
                  const c = byPerson.get(p.id);
                  const pc = prevBy.get(p.id);
                  const s = stats.get(p.id);
                  const o = c?.overall == null ? null : Number(c.overall);
                  const po = pc?.overall == null ? null : Number(pc.overall);
                  const flag = flagged.includes(p);
                  const canScore = v.personId !== p.id && (managedIds(org, v).has(p.id) || seesEverything(v));
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/team/${p.id}?tab=scores`} className="flex items-center gap-2 hover:text-brand">
                          <Avatar name={p.name} size={24} />
                          <span className="font-[550]">{p.name}</span>
                        </Link>
                      </td>
                      <td className="text-[13px] text-ink-2">{p.departmentId ? org.deptById.get(p.departmentId)?.name : ""}</td>
                      <td className="num text-[13px]" title={s?.onTimePct != null ? `Suggests ${onTimeToScore(s.onTimePct)} for on-time delivery` : "No tasks due yet this month"}>
                        {s?.onTimePct == null ? <span className="text-ink-3">–</span> : `${s.onTimePct}%`}
                      </td>
                      <td className="num text-[13px]" style={{ color: kraN.get(p.id) ? undefined : "var(--color-phase-y)" }}>
                        {kraN.get(p.id) ?? "none"}
                      </td>
                      <td className="text-[13px]">
                        {!c ? <span className="text-ink-3">Not started</span> : c.status === "draft" ? <span className="text-brand">Draft</span> : c.status === "shared" ? "Shared" : <span className="text-earth">Seen</span>}
                      </td>
                      <td className="num font-semibold" style={{ color: o !== null && o < 3 ? "var(--color-phase-y)" : undefined }} title={o !== null ? BAND_LABEL[band(o)!] : undefined}>
                        {o === null ? "" : o.toFixed(2)}
                        {flag && <span className="ml-1.5 chip h-5 bg-phase-y-wash text-[11px] text-phase-y">plan?</span>}
                      </td>
                      <td className="num text-[13px] text-ink-3">{po === null ? "" : po.toFixed(2)}</td>
                      <td className="text-right">
                        {canScore ? (
                          <Link className={c ? "btn btn-sm" : "btn btn-sm btn-primary"} href={`/scorecards/${p.id}/${month}`}>
                            {c ? (c.status === "draft" ? "Finish" : "Open") : "Score"}
                          </Link>
                        ) : (
                          c && c.status !== "draft" && (
                            <Link className="btn btn-sm" href={`/scorecards/${p.id}/${month}`}>
                              Open
                            </Link>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {flagged.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-2">
              “plan?” marks people below 3 for two months running. The structure plan suggests a written 60-day improvement plan with weekly check-ins.{" "}
              <Link href="/plans" className="link">
                Improvement plans
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
