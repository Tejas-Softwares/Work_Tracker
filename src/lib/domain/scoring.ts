import { addMonths } from "./dates";

/**
 * Monthly scorecards. Each KRA is scored 1–5 and weighted; behaviours get one 1–5 score.
 * Overall = 70% weighted KRA average + 30% behaviours. Two months running below 3 suggests an improvement plan.
 */

export const KRA_SHARE = 0.7;
export const BEHAVIOUR_SHARE = 0.3;
export const PLAN_THRESHOLD = 3;

export type KraScore = { score: number | null | undefined; weight: number };

export function isScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

/** Weighted average of the KRAs that have a score; null when none do. */
export function kraAverage(items: KraScore[]): number | null {
  let w = 0;
  let sum = 0;
  for (const k of items) {
    if (!isScore(k.score)) continue;
    const weight = k.weight > 0 ? k.weight : 1;
    w += weight;
    sum += k.score * weight;
  }
  return w ? round2(sum / w) : null;
}

export function overallScore(kraAvg: number | null, behaviour: number | null | undefined): number | null {
  if (kraAvg === null && !isScore(behaviour)) return null;
  if (kraAvg === null) return round2(behaviour as number);
  if (!isScore(behaviour)) return round2(kraAvg);
  return round2(kraAvg * KRA_SHARE + behaviour * BEHAVIOUR_SHARE);
}

export type Band = "outstanding" | "strong" | "meets" | "below" | "unsatisfactory";

export const BAND_LABEL: Record<Band, string> = {
  outstanding: "Outstanding",
  strong: "Strong",
  meets: "Meets expectations",
  below: "Below expectations",
  unsatisfactory: "Unsatisfactory",
};

export function band(overall: number | null): Band | null {
  if (overall === null || Number.isNaN(overall)) return null;
  if (overall >= 4.5) return "outstanding";
  if (overall >= 3.5) return "strong";
  if (overall >= 3) return "meets";
  if (overall >= 2) return "below";
  return "unsatisfactory";
}

/** True when `month` and the month before both scored below the threshold. */
export function suggestsPlan(history: { month: string; overall: number | null }[], month: string): boolean {
  const byMonth = new Map(history.map((h) => [h.month, h.overall]));
  const a = byMonth.get(month);
  const b = byMonth.get(addMonths(month, -1));
  return a !== undefined && b !== undefined && a !== null && b !== null && a < PLAN_THRESHOLD && b < PLAN_THRESHOLD;
}

/** Weights normalised to add up to 100, keeping their proportions (largest remainder). */
export function normaliseWeights(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return weights.map(() => Math.floor(100 / Math.max(1, weights.length)));
  const raw = weights.map((w) => (Math.max(0, w) / total) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
