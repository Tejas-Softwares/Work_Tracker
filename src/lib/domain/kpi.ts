/**
 * KPI status against target. Higher-is-better: at or above target is green, within 10% below is amber.
 * Lower-is-better: at or below target is green, within 10% above is amber. A zero target that must stay
 * at zero (incidents) is green only at zero.
 */

export type Rag = "green" | "amber" | "red";

export const RAG_LABEL: Record<Rag, string> = { green: "On target", amber: "Close", red: "Off target" };

export function rag(value: number | null | undefined, target: number | null | undefined, direction: string): Rag | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (target === null || target === undefined || Number.isNaN(target)) return null;
  if (direction === "lower") {
    if (value <= target) return "green";
    if (target === 0) return "red";
    return value <= target * 1.1 ? "amber" : "red";
  }
  if (value >= target) return "green";
  if (target === 0) return "green";
  return value >= target * 0.9 ? "amber" : "red";
}

/** "92%", "₹12.5 L", "4 days", "3". */
export function formatKpi(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const n = Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 1 : 0);
  const u = unit.trim();
  if (!u) return n;
  if (u === "%") return `${n}%`;
  if (u === "₹" || u.toLowerCase() === "inr") return `₹${Number(value).toLocaleString("en-IN")}`;
  if (u === "₹ lakh" || u.toLowerCase() === "lakh") return `₹${n} L`;
  return `${n} ${u}`;
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,₹%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
