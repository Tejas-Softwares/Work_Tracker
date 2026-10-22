import { redirect } from "next/navigation";
import { and, desc, gte, ilike, eq, type SQL } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { seesEverything } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { addDays, formatDateTime, todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/bits";

export const metadata = { title: "Activity log" };

const ENTITIES: [string, string][] = [
  ["", "Everything"],
  ["task", "Tasks"],
  ["scorecard", "Scorecards"],
  ["person", "People and role cards"],
  ["user", "Sign-ins and access"],
  ["meeting", "Meetings"],
  ["kpi", "KPIs"],
  ["plan", "Improvement plans"],
  ["structure", "Imports"],
  ["system", "Daily job"],
];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; days?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  if (!seesEverything(v)) redirect("/my");
  const days = Math.min(365, Math.max(1, Number(sp.days) || 30));
  const where: (SQL | undefined)[] = [gte(schema.activity.createdAt, new Date(`${addDays(todayISO(), -days)}T00:00:00+05:30`))];
  if (sp.entity) where.push(eq(schema.activity.entity, sp.entity));
  if (sp.q) where.push(ilike(schema.activity.summary, `%${sp.q.slice(0, 80)}%`));
  const rows = await db().select().from(schema.activity).where(and(...where)).orderBy(desc(schema.activity.createdAt)).limit(500);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Activity log" sub="Every change, who made it and when. Kept permanently." />
      <form className="mb-4 flex flex-wrap gap-2" action="/activity">
        <input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Search, e.g. a name or T-number" style={{ maxWidth: 280, height: 34 }} />
        <select className="select" name="entity" defaultValue={sp.entity ?? ""} style={{ width: 200, height: 34 }} aria-label="Kind">
          {ENTITIES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className="select" name="days" defaultValue={String(days)} style={{ width: 140, height: 34 }} aria-label="Period">
          <option value="1">Today</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">A year</option>
        </select>
        <button className="btn">Show</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-[13px] whitespace-nowrap text-ink-2">{formatDateTime(r.createdAt)}</td>
                <td className="text-[13px] whitespace-nowrap">{r.actorName}</td>
                <td className="text-[13.5px]">{r.summary}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-ink-3">
                  Nothing in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
