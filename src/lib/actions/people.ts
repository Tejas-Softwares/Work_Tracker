"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer } from "../auth/session";
import { getOrg, canManage, isHR } from "../org";
import { logActivity } from "../activity";
import { notify } from "../notify";
import { fail, type ActionResult } from "../form";

export type RoleCardInput = {
  rolePurpose: string;
  behaviours: string[];
  kras: { id?: string; title: string; measure: string; target: string; weight: number }[];
};

/** Managers, HR and management edit a person's role card: purpose, behaviours and weighted KRAs. */
export async function saveRoleCard(personId: string, input: RoleCardInput): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const p = org.byId.get(personId);
    if (!p) return { ok: false, error: "Unknown person." };
    if (!(canManage(org, v, personId) || isHR(v))) return { ok: false, error: "Only their manager, HR or management can change this role card." };
    const kras = input.kras.map((k) => ({ ...k, title: k.title.trim().slice(0, 160), measure: k.measure.trim().slice(0, 300), target: k.target.trim().slice(0, 200), weight: Math.max(0, Math.min(100, Math.round(k.weight || 0))) })).filter((k) => k.title);
    if (kras.length > 8) return { ok: false, error: "Keep it to 8 KRAs or fewer; 4 to 6 works best." };
    await db()
      .update(schema.people)
      .set({ rolePurpose: input.rolePurpose.trim().slice(0, 600), behaviours: input.behaviours.map((b) => b.trim()).filter(Boolean).slice(0, 8), updatedAt: new Date() })
      .where(eq(schema.people.id, personId));
    const existing = await db().select().from(schema.kras).where(eq(schema.kras.personId, personId));
    const keep = new Set<string>();
    for (const [i, k] of kras.entries()) {
      const found = k.id ? existing.find((e) => e.id === k.id) : undefined;
      if (found) {
        await db().update(schema.kras).set({ title: k.title, measure: k.measure, target: k.target, weight: k.weight, sort: i, active: true }).where(eq(schema.kras.id, found.id));
        keep.add(found.id);
      } else {
        const id = newId();
        await db().insert(schema.kras).values({ id, personId, title: k.title, measure: k.measure, target: k.target, weight: k.weight, sort: i });
        keep.add(id);
      }
    }
    for (const e of existing) if (!keep.has(e.id) && e.active) await db().update(schema.kras).set({ active: false }).where(and(eq(schema.kras.id, e.id)));
    await logActivity(v, "role_card", "person", personId, `${v.name} updated ${p.name}'s role card (${kras.length} KRAs)`);
    await notify([personId], { kind: "scorecard", title: `${v.name} updated your role card`, body: "Check your KRAs and targets.", link: `/team/${personId}` }, v.personId);
    refresh();
    return { ok: true, message: "Role card saved." };
  } catch (e) {
    return fail(e);
  }
}
