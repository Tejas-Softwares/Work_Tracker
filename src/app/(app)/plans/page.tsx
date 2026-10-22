import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray, and } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, isHR, managedIds } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { addMonths, diffDays, formatDate, monthOf, todayISO } from "@/lib/domain/dates";
import { suggestsPlan } from "@/lib/domain/scoring";
import { Avatar, Empty, PageHeader, Notice } from "@/components/ui/bits";

export const metadata = { title: "Improvement plans" };

const OUTCOME: Record<string, string> = { improved: "Improved", extended: "Extended", role_change: "Moved to another role", exit: "Exit" };

export default async function PlansPage() {
  const v = await requireViewer();
  const org = await getOrg();
  const managed = managedIds(org, v);
  if (!isHR(v) && managed.size === 0) redirect("/my");
  const today = todayISO();
  const ids = isHR(v) ? org.people.map((p) => p.id) : [...managed];
  const plans = ids.length ? await db().select().from(schema.improvementPlans).where(inArray(schema.improvementPlans.personId, ids)).orderBy(desc(schema.improvementPlans.startDate)) : [];
  const checkins = plans.length ? await db().select().from(schema.planCheckins).where(inArray(schema.planCheckins.planId, plans.map((p) => p.id))) : [];
  // people who scored below 3 for the last two shared months and have no running plan
  const m1 = addMonths(monthOf(today), -1);
  const m2 = addMonths(m1, -1);
  const cards = ids.length ? await db().select().from(schema.scorecards).where(and(inArray(schema.scorecards.personId, ids), inArray(schema.scorecards.month, [m1, m2]))) : [];
  const running = new Set(plans.filter((p) => p.status === "active").map((p) => p.personId));
  const suggested = [...new Set(cards.map((c) => c.personId))].filter(
    (pid) => !running.has(pid) && suggestsPlan(cards.filter((c) => c.personId === pid && c.status !== "draft").map((c) => ({ month: c.month, overall: c.overall === null ? null : Number(c.overall) })), m1),
  );
  const active = plans.filter((p) => p.status === "active");
  const closed = plans.filter((p) => p.status !== "active");
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Improvement plans" sub="A written 60-day plan with weekly check-ins, for anyone below 3 for two months running. Support first, then a decision based on the record." actions={<Link href="/plans/new" className="btn btn-primary">Start a plan</Link>} />
      {suggested.length > 0 && (
        <div className="mb-5">
          <Notice tone="warn">
            Below 3 in both {formatDate(`${m2}-01`).split(" ")[1]} and {formatDate(`${m1}-01`).split(" ")[1]} with no plan yet:{" "}
            {suggested.map((pid, i) => (
              <span key={pid}>
                {i > 0 && ", "}
                <Link className="font-semibold underline" href={`/plans/new?person=${pid}`}>
                  {org.byId.get(pid)?.name}
                </Link>
              </span>
            ))}
          </Notice>
        </div>
      )}
      <h2 className="section-title mb-2">Running ({active.length})</h2>
      {active.length === 0 ? (
        <Empty title="No plans running" />
      ) : (
        <ul className="mb-6 grid gap-2">
          {active.map((p) => {
            const person = org.byId.get(p.personId);
            const cs = checkins.filter((c) => c.planId === p.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn));
            const last = cs[0];
            const total = Math.max(1, diffDays(p.startDate, p.endDate));
            const gone = Math.min(total, Math.max(0, diffDays(p.startDate, today)));
            const overdueCheck = diffDays(last?.heldOn ?? p.startDate, today) > 7;
            return (
              <li key={p.id}>
                <Link href={`/plans/${p.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 hover:bg-[#fafbfd]">
                  <Avatar name={person?.name ?? "?"} size={30} />
                  <div className="min-w-[180px] flex-1">
                    <div className="font-semibold">{person?.name}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {formatDate(p.startDate, today)} to {formatDate(p.endDate, today)}, day {gone} of {total}
                    </div>
                  </div>
                  <div className="w-40">
                    <div className="h-1.5 overflow-hidden rounded-full bg-wash-2">
                      <div className="h-full bg-brand" style={{ width: `${(gone / total) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-[12.5px]" style={{ color: overdueCheck ? "var(--color-phase-y)" : "var(--color-ink-2)" }}>
                    {cs.length} check-in{cs.length === 1 ? "" : "s"}
                    {last ? `, last ${formatDate(last.heldOn, today)}` : ""}
                    {overdueCheck ? ", one is due" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="section-title mb-2">Closed</h2>
          <ul className="grid gap-1.5 text-[13.5px]">
            {closed.map((p) => (
              <li key={p.id}>
                <Link className="link" href={`/plans/${p.id}`}>
                  {org.byId.get(p.personId)?.name}
                </Link>{" "}
                <span className="text-ink-3">
                  {formatDate(p.startDate, today)} to {formatDate(p.endDate, today)}: {OUTCOME[p.outcome] ?? p.outcome}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

