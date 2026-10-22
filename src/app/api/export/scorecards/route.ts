import { and, eq, inArray } from "drizzle-orm";
import { currentViewer } from "@/lib/auth/session";
import { getOrg, isHR, managedIds, seesEverything } from "@/lib/org";
import { db, schema } from "@/lib/db";
import { isMonth, monthLabel, monthOf, todayISO } from "@/lib/domain/dates";
import { band, BAND_LABEL } from "@/lib/domain/scoring";
import { addTable, newBook, xlsxResponse } from "@/lib/excel/reports";

export async function GET(request: Request) {
  const v = await currentViewer();
  if (!v) return new Response("Sign in first.", { status: 401 });
  const m = new URL(request.url).searchParams.get("month") ?? "";
  const month = isMonth(m) ? m : monthOf(todayISO());
  const org = await getOrg();
  const all = isHR(v) || seesEverything(v);
  const ids = org.active.filter((p) => !p.isVacancy && (all || managedIds(org, v).has(p.id))).map((p) => p.id);
  if (!ids.length) return new Response("No one to export.", { status: 403 });
  const cards = await db().select().from(schema.scorecards).where(and(eq(schema.scorecards.month, month), inArray(schema.scorecards.personId, ids)));
  const by = new Map(cards.map((c) => [c.personId, c]));
  const wb = newBook();
  addTable(
    wb,
    "Scorecards",
    `Scorecards, ${monthLabel(month, true)}`,
    [
      { header: "Person", width: 24 },
      { header: "Designation", width: 28 },
      { header: "Department", width: 22 },
      { header: "Reports to", width: 22 },
      { header: "Status", width: 12 },
      { header: "KRA average", width: 11, numFmt: "0.00" },
      { header: "Behaviours", width: 11 },
      { header: "Overall", width: 9, numFmt: "0.00" },
      { header: "Band", width: 20 },
      { header: "On time %", width: 10 },
      { header: "Tasks finished", width: 10 },
      { header: "What went well", width: 40 },
      { header: "To improve", width: 40 },
    ],
    ids.map((id) => {
      const p = org.byId.get(id)!;
      const c = by.get(id);
      const ks = c ? Object.values(c.kraScores).filter((k) => k.score) : [];
      const w = ks.reduce((a, k) => a + (k.weight ?? 0), 0);
      const avg = ks.length && w ? ks.reduce((a, k) => a + (k.score ?? 0) * (k.weight ?? 0), 0) / w : null;
      const o = c?.overall == null ? null : Number(c.overall);
      return [
        p.name,
        p.designation,
        p.departmentId ? org.deptById.get(p.departmentId)?.name ?? "" : "",
        p.reportsTo ? org.byId.get(p.reportsTo)?.name ?? "" : "",
        !c ? "Not started" : c.status === "draft" ? "Draft" : c.status === "shared" ? "Shared" : "Seen",
        avg === null ? null : Math.round(avg * 100) / 100,
        c?.behaviourScore == null ? null : Number(c.behaviourScore),
        o,
        o === null ? "" : BAND_LABEL[band(o)!],
        c && c.taskStats.onTimePct !== undefined && c.taskStats.onTimePct >= 0 ? c.taskStats.onTimePct : null,
        c?.taskStats.done ?? null,
        c?.strengths ?? "",
        c?.improve ?? "",
      ];
    }),
  );
  return xlsxResponse(wb, `Tejas_Scorecards_${month}.xlsx`);
}
