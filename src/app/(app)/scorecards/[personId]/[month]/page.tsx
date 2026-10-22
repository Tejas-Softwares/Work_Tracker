import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, canManage, canSeeScores, seesEverything, isHR } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { statTasks, monthStats } from "@/lib/data/stats";
import { addMonths, isMonth, monthLabel, monthOf, todayISO, formatDateTime } from "@/lib/domain/dates";
import { onTimeToScore } from "@/lib/domain/tasks";
import { Avatar, Notice, PageHeader } from "@/components/ui/bits";
import { ScoreForm } from "@/components/scores/ScoreForm";

export default async function ScorePage({ params }: { params: Promise<{ personId: string; month: string }> }) {
  const { personId, month } = await params;
  if (!isMonth(month)) notFound();
  const v = await requireViewer();
  const org = await getOrg();
  const p = org.byId.get(personId);
  if (!p || !canSeeScores(org, v, personId)) notFound();
  const today = todayISO();
  const self = v.personId === personId;
  const canScore = !self && (canManage(org, v, personId) || seesEverything(v));
  const [kras, cardRows, prevRows, tasks] = await Promise.all([
    db().select().from(schema.kras).where(and(eq(schema.kras.personId, personId), eq(schema.kras.active, true))).orderBy(asc(schema.kras.sort)),
    db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, personId), eq(schema.scorecards.month, month))).limit(1),
    db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, personId), eq(schema.scorecards.month, addMonths(month, -1)))).limit(1),
    statTasks([personId], `${month}-01`),
  ]);
  const card = cardRows[0];
  const prev = prevRows[0];
  if (self && (!card || card.status === "draft")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/scorecards", label: "Scorecards" }} title={`${monthLabel(month, true)} scorecard`} />
        <Notice>Your manager hasn&apos;t shared your {monthLabel(month)} scorecard yet. You&apos;ll be told when they do.</Notice>
      </div>
    );
  }
  if (!canScore && !self && (!card || (card.status === "draft" && !isHR(v)))) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/scorecards", label: "Scorecards" }} title={`${p.name}, ${monthLabel(month, true)}`} />
        <Notice>No scorecard has been shared for this month yet.</Notice>
      </div>
    );
  }
  const live = monthStats(tasks, month, today);
  const stats = card && card.status !== "draft" && card.taskStats?.due !== undefined ? { ...card.taskStats, onTimePct: card.taskStats.onTimePct === -1 ? null : card.taskStats.onTimePct } : { onTimePct: live.onTimePct, due: live.due, matured: live.matured, onTime: live.onTime, late: live.late, done: live.doneInPeriod, slips: live.slips, overdueNow: live.overdueNow };
  const scorer = card?.scoredBy ? org.byId.get(card.scoredBy)?.name : undefined;
  // KRAs on the card: current ones, plus any scored KRA that has since been removed (kept as scored)
  const kraList = kras.map((k) => ({ id: k.id, title: k.title, measure: k.measure, target: k.target, weight: k.weight }));
  for (const [id, s] of Object.entries(card?.kraScores ?? {})) if (!kraList.some((k) => k.id === id) && s.title) kraList.push({ id, title: s.title, measure: "", target: "", weight: s.weight ?? 0 });

  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        back={{ href: `/scorecards?month=${month}`, label: "Scorecards" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p.name} size={40} />
            <span>
              {p.name}, {monthLabel(month, true)}
            </span>
          </span>
        }
        sub={`${p.designation}${p.departmentId ? `, ${org.deptById.get(p.departmentId)?.name}` : ""}${scorer ? `. Scored by ${scorer}` : ""}${card?.sharedAt ? `, shared ${formatDateTime(card.sharedAt)}` : ""}`}
      />
      <ScoreForm
        personId={personId}
        personName={p.name}
        month={month}
        monthText={monthLabel(month)}
        editable={canScore && month <= monthOf(today)}
        self={self}
        kras={kraList}
        behaviours={p.behaviours}
        card={
          card
            ? {
                status: card.status,
                kra: Object.fromEntries(Object.entries(card.kraScores).map(([k, s]) => [k, { score: s.score ?? null, note: s.note ?? "" }])),
                behaviour: card.behaviourScore === null ? null : Number(card.behaviourScore),
                strengths: card.strengths,
                improve: card.improve,
                comment: card.managerComment,
                employeeComment: card.employeeComment,
                acknowledgedAt: card.acknowledgedAt?.toISOString() ?? null,
              }
            : null
        }
        prev={prev && prev.status !== "draft" ? { overall: prev.overall === null ? null : Number(prev.overall), kra: Object.fromEntries(Object.entries(prev.kraScores).map(([k, s]) => [k, s.score ?? null])) } : null}
        stats={stats as { onTimePct: number | null; due: number; matured: number; onTime: number; late: number; done: number; slips: number; overdueNow: number }}
        suggested={onTimeToScore(stats.onTimePct as number | null)}
      />
    </div>
  );
}
