import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, canEditKpis } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { addMonths, isMonth, monthLabel, monthOf, todayISO } from "@/lib/domain/dates";
import { PageHeader, Empty } from "@/components/ui/bits";
import { KpiTable, type KpiRow } from "@/components/kpis/KpiTable";

export const metadata = { title: "Department KPIs" };

export default async function KpisPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const org = await getOrg();
  const current = monthOf(todayISO());
  const month = isMonth(sp.month) && sp.month <= current ? sp.month : current;
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const [kpis, values] = await Promise.all([
    db().select().from(schema.kpis).orderBy(asc(schema.kpis.sort)),
    db().select().from(schema.kpiValues).where(inArray(schema.kpiValues.month, months)),
  ]);
  const byDept = org.departments
    .filter((d) => d.active)
    .map((d) => ({
      d,
      edit: canEditKpis(org, v, d.id),
      rows: kpis
        .filter((k) => k.departmentId === d.id)
        .map(
          (k): KpiRow => ({
            id: k.id,
            name: k.name,
            unit: k.unit,
            target: k.target === null ? null : Number(k.target),
            direction: k.direction,
            owner: k.ownerPersonId ? org.byId.get(k.ownerPersonId)?.name ?? "" : "",
            ownerId: k.ownerPersonId,
            description: k.description,
            active: k.active,
            canEnter: canEditKpis(org, v, d.id) || (!!v.personId && k.ownerPersonId === v.personId),
            values: Object.fromEntries(values.filter((x) => x.kpiId === k.id).map((x) => [x.month, { value: Number(x.value), note: x.note }])),
          }),
        ),
    }))
    .filter((g) => g.rows.length || g.edit);
  const withKpis = byDept.filter((g) => g.rows.some((r) => r.active));
  const withoutKpis = byDept.filter((g) => !g.rows.some((r) => r.active) && g.edit);
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Department KPIs"
        sub="Each department head answers for these numbers in the monthly business review. Enter the month's figure in its column."
        actions={
          <div className="flex items-center gap-1">
            <Link className="btn btn-sm" href={`/kpis?month=${addMonths(month, -1)}`} aria-label="Earlier">
              ‹
            </Link>
            <span className="min-w-[120px] text-center text-[14px] font-semibold">to {monthLabel(month, true)}</span>
            {month < current && (
              <Link className="btn btn-sm" href={`/kpis?month=${addMonths(month, 1)}`} aria-label="Later">
                ›
              </Link>
            )}
            <a className="btn btn-sm ml-2" href={`/api/export/kpis?month=${month}`}>
              Excel
            </a>
          </div>
        }
      />
      {withKpis.length === 0 && withoutKpis.length === 0 ? (
        <Empty title="No KPIs yet">An admin can import KPIs with the team workbook, or a department head can add them here.</Empty>
      ) : (
        <div className="grid gap-6">
          {withKpis.map((g) => (
            <KpiTable key={g.d.id} deptId={g.d.id} deptName={g.d.name} head={g.d.headPersonId ? org.byId.get(g.d.headPersonId)?.name ?? "" : ""} months={months} rows={g.rows} canEdit={g.edit} people={people} />
          ))}
          {withoutKpis.length > 0 && (
            <section className="rounded-lg border border-dashed border-line-strong p-4">
              <h2 className="section-title">No KPIs yet</h2>
              <div className="mt-2 grid gap-2">
                {withoutKpis.map((g) => (
                  <KpiTable key={g.d.id} compact deptId={g.d.id} deptName={g.d.name} head="" months={months} rows={[]} canEdit={g.edit} people={people} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
