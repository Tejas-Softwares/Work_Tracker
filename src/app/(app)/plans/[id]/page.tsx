import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, canManage, isHR } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { diffDays, formatDate, monthLabel, monthOf, todayISO } from "@/lib/domain/dates";
import { Avatar, PageHeader, Notice } from "@/components/ui/bits";
import { PlanRecord } from "@/components/plans/PlanRecord";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer();
  const org = await getOrg();
  const plan = (await db().select().from(schema.improvementPlans).where(eq(schema.improvementPlans.id, id)).limit(1))[0];
  if (!plan) notFound();
  const self = v.personId === plan.personId;
  const canEdit = canManage(org, v, plan.personId) || isHR(v);
  if (!self && !canEdit) notFound();
  const p = org.byId.get(plan.personId);
  const today = todayISO();
  const [checkins, cards] = await Promise.all([
    db().select().from(schema.planCheckins).where(eq(schema.planCheckins.planId, id)).orderBy(desc(schema.planCheckins.heldOn)),
    db()
      .select({ month: schema.scorecards.month, overall: schema.scorecards.overall, status: schema.scorecards.status })
      .from(schema.scorecards)
      .where(and(eq(schema.scorecards.personId, plan.personId), gte(schema.scorecards.month, monthOf(plan.startDate)), lte(schema.scorecards.month, monthOf(plan.endDate))))
      .orderBy(asc(schema.scorecards.month)),
  ]);
  const total = Math.max(1, diffDays(plan.startDate, plan.endDate));
  const gone = Math.min(total, Math.max(0, diffDays(plan.startDate, today)));
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        back={{ href: self ? "/my" : "/plans", label: self ? "My work" : "Improvement plans" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p?.name ?? "?"} size={40} />
            Improvement plan: {p?.name}
          </span>
        }
        sub={`${formatDate(plan.startDate, today)} to ${formatDate(plan.endDate, today)}${plan.status === "active" ? `, day ${gone} of ${total}` : ""}. Manager: ${plan.managerPersonId ? org.byId.get(plan.managerPersonId)?.name : "not set"}.`}
      />
      {plan.status !== "active" && (
        <div className="mb-4">
          <Notice tone={plan.outcome === "improved" ? "good" : "info"}>
            Closed: {plan.outcome.replace("_", " ")}. {plan.outcomeNote}
          </Notice>
        </div>
      )}
      <div className="grid gap-5">
        <section>
          <h2 className="section-title mb-1">Why</h2>
          <p className="text-[14px] whitespace-pre-wrap">{plan.reason}</p>
        </section>
        <section>
          <h2 className="section-title mb-1">Support</h2>
          <p className="text-[14px] whitespace-pre-wrap">{plan.support || <span className="text-ink-3">None written.</span>}</p>
        </section>
        {cards.length > 0 && (
          <section>
            <h2 className="section-title mb-1">Monthly scores during the plan</h2>
            <p className="text-[14px]">
              {cards.map((c, i) => (
                <span key={c.month}>
                  {i > 0 && ", "}
                  {c.status === "draft" ? `${monthLabel(c.month)} draft` : <Link className="link" href={`/scorecards/${plan.personId}/${c.month}`}>{`${monthLabel(c.month)} ${Number(c.overall).toFixed(2)}`}</Link>}
                </span>
              ))}
            </p>
          </section>
        )}
        <PlanRecord
          planId={plan.id}
          active={plan.status === "active"}
          canEdit={canEdit}
          today={today}
          endDate={plan.endDate}
          goals={plan.goals}
          checkins={checkins.map((c) => ({ id: c.id, heldOn: c.heldOn, progress: c.progress, note: c.note, author: c.authorPersonId ? org.byId.get(c.authorPersonId)?.name ?? "" : "" }))}
        />
      </div>
    </div>
  );
}
