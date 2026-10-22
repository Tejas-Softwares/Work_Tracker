import { asc, inArray } from "drizzle-orm";
import { currentViewer } from "@/lib/auth/session";
import { getOrg } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { addMonths, isMonth, monthLabel, monthOf, todayISO } from "@/lib/domain/dates";
import { rag, RAG_LABEL } from "@/lib/domain/kpi";
import { addTable, newBook, xlsxResponse } from "@/lib/excel/reports";

export async function GET(request: Request) {
  const v = await currentViewer();
  if (!v) return new Response("Sign in first.", { status: 401 });
  const m = new URL(request.url).searchParams.get("month") ?? "";
  const month = isMonth(m) ? m : monthOf(todayISO());
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const org = await getOrg();
  const [kpis, vals] = await Promise.all([db().select().from(schema.kpis).orderBy(asc(schema.kpis.sort)), db().select().from(schema.kpiValues).where(inArray(schema.kpiValues.month, months))]);
  const wb = newBook();
  addTable(
    wb,
    "KPIs",
    `Department KPIs to ${monthLabel(month, true)}`,
    [
      { header: "Department", width: 22 },
      { header: "KPI", width: 44 },
      { header: "Unit", width: 10 },
      { header: "Target", width: 9 },
      { header: "Better when", width: 11 },
      ...months.map((x) => ({ header: monthLabel(x), width: 10 })),
      { header: `Status ${monthLabel(month)}`, width: 14 },
      { header: "Owner", width: 22 },
    ],
    kpis
      .filter((k) => k.active)
      .map((k) => {
        const val = (x: string) => {
          const r = vals.find((y) => y.kpiId === k.id && y.month === x);
          return r ? Number(r.value) : null;
        };
        const s = rag(val(month), k.target === null ? null : Number(k.target), k.direction);
        return [
          org.deptById.get(k.departmentId)?.name ?? "",
          k.name,
          k.unit,
          k.target === null ? null : Number(k.target),
          k.direction === "lower" ? "Lower" : "Higher",
          ...months.map(val),
          s ? RAG_LABEL[s] : "",
          k.ownerPersonId ? org.byId.get(k.ownerPersonId)?.name ?? "" : "",
        ];
      }),
  );
  return xlsxResponse(wb, `Tejas_KPIs_${month}.xlsx`);
}
