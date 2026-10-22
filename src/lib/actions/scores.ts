"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { requireViewer } from "../auth/session";
import { getOrg, canManage, seesEverything, isHR, managersOf } from "../org";
import { logActivity } from "../activity";
import { notify } from "../notify";
import { fail, type ActionResult } from "../form";
import { isMonth, monthLabel, todayISO, addDays, isISODate, monthOf } from "../domain/dates";
import { isScore, kraAverage, overallScore } from "../domain/scoring";
import { statTasks, monthStats } from "../data/stats";

export type ScoreInput = {
  kra: Record<string, { score: number | null; note: string }>;
  behaviour: number | null;
  strengths: string;
  improve: string;
  comment: string;
};

export async function saveScorecard(personId: string, month: string, input: ScoreInput, share: boolean): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const p = org.byId.get(personId);
    if (!p) return { ok: false, error: "Unknown person." };
    if (!isMonth(month)) return { ok: false, error: "Unknown month." };
    if (month > monthOf(todayISO())) return { ok: false, error: "That month hasn't started yet." };
    if (v.personId === personId) return { ok: false, error: "You can't score yourself. Your manager scores you." };
    if (!(canManage(org, v, personId) || seesEverything(v))) return { ok: false, error: "Only their manager or management can score them." };

    const kras = await db().select().from(schema.kras).where(and(eq(schema.kras.personId, personId), eq(schema.kras.active, true)));
    const kraScores: Record<string, { score: number | null; note?: string; title?: string; weight?: number }> = {};
    for (const k of kras) {
      const s = input.kra[k.id];
      kraScores[k.id] = { score: s && isScore(s.score) ? s.score : null, note: (s?.note ?? "").slice(0, 500), title: k.title, weight: k.weight };
    }
    const behaviour = isScore(input.behaviour) ? input.behaviour : null;
    if (share) {
      const missing = kras.filter((k) => !isScore(kraScores[k.id].score));
      if (missing.length) return { ok: false, error: `Score every KRA before sharing. Missing: ${missing.map((m) => m.title).join(", ")}.` };
      if (behaviour === null) return { ok: false, error: "Score behaviours before sharing." };
    }
    const avg = kraAverage(Object.values(kraScores).map((k) => ({ score: k.score, weight: k.weight ?? 0 })));
    const overall = overallScore(avg, behaviour);
    const stats = monthStats(await statTasks([personId], `${month}-01`), month, todayISO());

    const existing = (await db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, personId), eq(schema.scorecards.month, month))).limit(1))[0];
    if (existing && existing.status === "acknowledged" && !seesEverything(v)) return { ok: false, error: "They've already seen and acknowledged this scorecard. Ask management to change it." };
    const values = {
      kraScores,
      behaviourScore: behaviour === null ? null : String(behaviour),
      overall: overall === null ? null : String(overall),
      taskStats: { onTimePct: stats.onTimePct ?? -1, due: stats.due, matured: stats.matured, onTime: stats.onTime, late: stats.late, done: stats.doneInPeriod, slips: stats.slips, overdueNow: stats.overdueNow },
      strengths: input.strengths.slice(0, 2000),
      improve: input.improve.slice(0, 2000),
      managerComment: input.comment.slice(0, 2000),
      scoredBy: v.personId,
      updatedAt: new Date(),
      ...(share ? { status: existing?.status === "acknowledged" ? "acknowledged" : "shared", sharedAt: existing?.sharedAt ?? new Date() } : {}),
    };
    if (existing) await db().update(schema.scorecards).set(values).where(eq(schema.scorecards.id, existing.id));
    else await db().insert(schema.scorecards).values({ id: newId(), personId, month, status: share ? "shared" : "draft", ...values });

    if (share && existing?.status !== "shared") {
      await notify([personId], { kind: "scorecard", title: `Your ${monthLabel(month)} scorecard is ready`, body: overall !== null ? `Overall ${overall.toFixed(2)}` : "", link: `/scorecards/${personId}/${month}` }, v.personId);
    }
    await logActivity(v, share ? "share_score" : "save_score", "scorecard", personId, `${v.name} ${share ? "shared" : "saved a draft of"} ${p.name}'s ${monthLabel(month)} scorecard${overall !== null ? ` (${overall.toFixed(2)})` : ""}`);
    refresh();
    return { ok: true, message: share ? `Shared with ${p.name}.` : "Draft saved. Only managers and HR can see it." };
  } catch (e) {
    return fail(e);
  }
}

export async function acknowledgeScorecard(personId: string, month: string, comment: string): Promise<ActionResult> {
  try {
    const v = await requireViewer();
    if (v.personId !== personId) return { ok: false, error: "Only the person scored can acknowledge their scorecard." };
    const s = (await db().select().from(schema.scorecards).where(and(eq(schema.scorecards.personId, personId), eq(schema.scorecards.month, month))).limit(1))[0];
    if (!s || s.status === "draft") return { ok: false, error: "This scorecard hasn't been shared with you yet." };
    await db().update(schema.scorecards).set({ status: "acknowledged", acknowledgedAt: new Date(), employeeComment: comment.slice(0, 2000), updatedAt: new Date() }).where(eq(schema.scorecards.id, s.id));
    const org = await getOrg();
    await notify([s.scoredBy, managersOf(org, personId)[0]?.id], { kind: "scorecard", title: `${v.name} read their ${monthLabel(month)} scorecard`, body: comment ? `Comment: ${comment.slice(0, 160)}` : "", link: `/scorecards/${personId}/${month}` }, v.personId);
    await logActivity(v, "ack_score", "scorecard", s.id, `${v.name} acknowledged their ${monthLabel(month)} scorecard`);
    refresh();
    return { ok: true, message: "Thanks. Your manager has been told." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- improvement plans

export type PlanInput = { startDate: string; endDate: string; reason: string; support: string; goals: { text: string; measure: string }[] };

export async function createPlan(personId: string, input: PlanInput): Promise<ActionResult<{ id: string }>> {
  try {
    const v = await requireViewer();
    const org = await getOrg();
    const p = org.byId.get(personId);
    if (!p) return { ok: false, error: "Unknown person." };
    if (!(canManage(org, v, personId) || isHR(v))) return { ok: false, error: "Only their manager or HR can start an improvement plan." };
    if (!isISODate(input.startDate) || !isISODate(input.endDate) || input.endDate <= input.startDate) return { ok: false, error: "Give a start date and a later end date (usually 60 days)." };
    const goals = input.goals.map((g) => ({ text: g.text.trim().slice(0, 300), measure: g.measure.trim().slice(0, 300), met: null })).filter((g) => g.text);
    if (!goals.length) return { ok: false, error: "Add at least one goal with how it will be measured." };
    if (!input.reason.trim()) return { ok: false, error: "Say why the plan is needed, in facts: scores, tasks, examples." };
    const id = newId();
    await db().insert(schema.improvementPlans).values({
      id,
      personId,
      managerPersonId: p.reportsTo ?? v.personId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason.slice(0, 3000),
      support: input.support.slice(0, 3000),
      goals,
      createdBy: v.personId,
    });
    await notify([p.reportsTo], { kind: "plan", title: `Improvement plan started for ${p.name}`, body: `Weekly check-ins until ${input.endDate}`, link: `/plans/${id}` }, v.personId);
    await logActivity(v, "create", "plan", id, `${v.name} started an improvement plan for ${p.name}`);
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

async function planAccess(planId: string) {
  const v = await requireViewer();
  const org = await getOrg();
  const plan = (await db().select().from(schema.improvementPlans).where(eq(schema.improvementPlans.id, planId)).limit(1))[0];
  if (!plan) throw new Error("This plan no longer exists.");
  if (!(canManage(org, v, plan.personId) || isHR(v))) throw new Error("Only their manager or HR can change this plan.");
  return { v, plan, org };
}

export async function addCheckin(planId: string, input: { heldOn: string; progress: string; note: string }): Promise<ActionResult> {
  try {
    const { v, plan } = await planAccess(planId);
    if (!isISODate(input.heldOn)) return { ok: false, error: "Give the date of the check-in." };
    if (!["on_track", "some_progress", "off_track"].includes(input.progress)) return { ok: false, error: "Pick how it is going." };
    if (!input.note.trim()) return { ok: false, error: "Write what was discussed and agreed." };
    await db().insert(schema.planCheckins).values({ id: newId(), planId, heldOn: input.heldOn, progress: input.progress, note: input.note.slice(0, 3000), authorPersonId: v.personId });
    await notify([plan.personId], { kind: "plan", title: "A check-in was added to your improvement plan", link: `/plans/${planId}` }, v.personId);
    refresh();
    return { ok: true, message: "Check-in saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function closePlan(planId: string, input: { outcome: string; note: string; goalsMet: (boolean | null)[]; extendTo?: string }): Promise<ActionResult> {
  try {
    const { v, plan, org } = await planAccess(planId);
    if (!["improved", "extended", "role_change", "exit"].includes(input.outcome)) return { ok: false, error: "Pick an outcome." };
    if (!input.note.trim()) return { ok: false, error: "Write the reasons for the outcome." };
    const goals = plan.goals.map((g, i) => ({ ...g, met: input.goalsMet[i] ?? g.met }));
    if (input.outcome === "extended") {
      const to = input.extendTo && isISODate(input.extendTo) ? input.extendTo : addDays(plan.endDate, 30);
      await db().update(schema.improvementPlans).set({ endDate: to, goals, outcomeNote: input.note.slice(0, 3000), updatedAt: new Date() }).where(eq(schema.improvementPlans.id, planId));
    } else {
      await db().update(schema.improvementPlans).set({ status: "completed", outcome: input.outcome, outcomeNote: input.note.slice(0, 3000), goals, updatedAt: new Date() }).where(eq(schema.improvementPlans.id, planId));
    }
    await logActivity(v, "close", "plan", planId, `${v.name} recorded the outcome of ${org.byId.get(plan.personId)?.name ?? "a"} improvement plan: ${input.outcome.replace("_", " ")}`);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
