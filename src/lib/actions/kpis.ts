"use server";

import { refresh } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer } from "../auth/session";
import { getOrg, canEditKpis } from "../org";
import { logActivity } from "../activity";
import { fail, type ActionResult } from "../form";
import { isMonth, monthLabel, monthOf, todayISO } from "../domain/dates";
import { toNumber, rag } from "../domain/kpi";
import { notify } from "../notify";

export async function saveKpiValue(kpiId: string, month: string, value: string, note: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const k = (await db().select().from(schema.kpis).where(eq(schema.kpis.id, kpiId)).limit(1))[0];
    if (!k) return { ok: false, error: "Unknown KPI." };
    if (!canEditKpis(org, v, k.departmentId) && k.ownerPersonId !== v.personId) return { ok: false, error: "Only the department head, the KPI owner or management can enter this figure." };
    if (!isMonth(month) || month > monthOf(todayISO())) return { ok: false, error: "Pick this month or an earlier one." };
    if (value.trim() === "") {
      await db().delete(schema.kpiValues).where(and(eq(schema.kpiValues.kpiId, kpiId), eq(schema.kpiValues.month, month)));
      refresh();
      return { ok: true, message: "Cleared." };
    }
    const n = toNumber(value);
    if (n === null) return { ok: false, error: "Enter a number, e.g. 92 or 4.5." };
    await db()
      .insert(schema.kpiValues)
      .values({ kpiId, month, value: String(n), note: note.slice(0, 300), enteredBy: v.personId })
      .onConflictDoUpdate({ target: [schema.kpiValues.kpiId, schema.kpiValues.month], set: { value: String(n), note: note.slice(0, 300), enteredBy: v.personId, enteredAt: new Date() } });
    const status = rag(n, k.target === null ? null : Number(k.target), k.direction);
    if (status === "red") {
      const d = org.deptById.get(k.departmentId);
      await notify([d?.directorPersonId, d?.headPersonId], { kind: "status", title: `${k.name} is off target for ${monthLabel(month)}: ${n}${k.unit === "%" ? "%" : ` ${k.unit}`}`, body: `Target ${k.target}`, link: `/kpis?month=${month}` }, v.personId);
    }
    await logActivity(v, "kpi_value", "kpi", kpiId, `${v.name} entered ${k.name} for ${monthLabel(month)}: ${n}`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveKpi(input: { id?: string; departmentId: string; name: string; unit: string; target: string; direction: string; ownerPersonId: string | null; description: string; active?: boolean }): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    if (!org.deptById.has(input.departmentId)) return { ok: false, error: "Pick a department." };
    if (!canEditKpis(org, v, input.departmentId)) return { ok: false, error: "Only the department head or management can change KPIs." };
    const name = input.name.trim().slice(0, 120);
    if (!name) return { ok: false, error: "Name the KPI." };
    const t = input.target.trim() === "" ? null : toNumber(input.target);
    if (input.target.trim() !== "" && t === null) return { ok: false, error: "The target must be a number, or left empty." };
    const values = {
      departmentId: input.departmentId,
      name,
      unit: input.unit.trim().slice(0, 20),
      target: t === null ? null : String(t),
      direction: input.direction === "lower" ? "lower" : "higher",
      ownerPersonId: input.ownerPersonId || null,
      description: input.description.slice(0, 300),
      active: input.active ?? true,
    };
    if (input.id) await db().update(schema.kpis).set(values).where(eq(schema.kpis.id, input.id));
    else await db().insert(schema.kpis).values({ id: newId(), ...values, sort: 99 });
    await logActivity(v, input.id ? "update" : "create", "kpi", input.id ?? null, `${v.name} ${input.id ? "changed" : "added"} the KPI ${name}`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
