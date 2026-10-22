import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, seesEverything } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { PageHeader, SplitBar, Empty } from "@/components/ui/bits";
import { InitiativeForm } from "@/components/initiatives/InitiativeForm";

export const metadata = { title: "Initiatives" };

const STATUS: Record<string, string> = { planned: "Planned", active: "Active", on_hold: "On hold", done: "Done" };

export default async function InitiativesPage() {
  const v = await requireViewer();
  const org = await getOrg();
  const today = todayISO();
  const rows = await db()
    .select({
      i: schema.initiatives,
      total: sql<number>`(select count(*)::int from tasks t where t.initiative_id = "initiatives"."id" and t.status <> 'cancelled')`,
      done: sql<number>`(select count(*)::int from tasks t where t.initiative_id = "initiatives"."id" and t.status = 'done')`,
      late: sql<number>`(select count(*)::int from tasks t where t.initiative_id = "initiatives"."id" and t.status in ('todo','in_progress','blocked') and t.due_date < ${today})`,
      next: sql<string | null>`(select m.name || '|' || coalesce(m.due_date::text, '') from milestones m where m.initiative_id = "initiatives"."id" and m.status = 'pending' order by m.due_date nulls last limit 1)`,
    })
    .from(schema.initiatives)
    .orderBy(sql`case ${schema.initiatives.status} when 'active' then 0 when 'planned' then 1 when 'on_hold' then 2 else 3 end`, asc(schema.initiatives.endDate));
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Initiatives" sub="Company-level pieces of work with gates and dates: the structure rollout, hiring, a new system. Their tasks sit in everyone's normal list." actions={seesEverything(v) ? <InitiativeForm people={people} /> : undefined} />
      {rows.length === 0 ? (
        <Empty title="No initiatives yet" />
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ i, total, done, late, next }) => {
            const [nextName, nextDue] = (next ?? "").split("|");
            return (
              <li key={i.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/initiatives/${i.id}`} className="text-[16px] font-semibold hover:text-brand">
                    {i.name}
                  </Link>
                  <span className="text-[12.5px] text-ink-2">
                    {STATUS[i.status]}
                    {i.ownerPersonId ? `, owner ${org.byId.get(i.ownerPersonId)?.name}` : ""}
                    {i.startDate && i.endDate ? `, ${formatDate(i.startDate, today)} to ${formatDate(i.endDate, today)}` : ""}
                  </span>
                </div>
                {i.description && <p className="mt-1 text-[13.5px] text-ink-2">{i.description}</p>}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <SplitBar
                      height={8}
                      parts={[
                        { value: done, color: "var(--color-earth-mark)", label: "Done" },
                        { value: late, color: "var(--color-phase-y-mark)", label: "Late" },
                        { value: total - done - late, color: "var(--color-brand-line)", label: "To do" },
                      ]}
                    />
                  </div>
                  <span className="num text-[12.5px] whitespace-nowrap text-ink-2">
                    {done} of {total} tasks done{late ? <span className="text-phase-y">, {late} late</span> : ""}
                  </span>
                </div>
                {nextName && (
                  <p className="mt-2 text-[12.5px] text-ink-3">
                    Next gate: <span className="text-ink-2">{nextName}</span>
                    {nextDue ? `, ${formatDate(nextDue, today)}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
