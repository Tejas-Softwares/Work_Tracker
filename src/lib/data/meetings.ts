import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { addDays, isWorkingDay, recentWorkingDays, weekday, daysInMonth, monthOf, DEFAULT_WORKING_DAYS } from "../domain/dates";

export type Rhythm = typeof schema.meetingRhythm.$inferSelect;

export const KIND_LABEL: Record<string, string> = {
  huddle: "Daily huddle",
  project_review: "Project review",
  management_review: "Management review",
  monthly_review: "Monthly business review",
  one_to_one: "One-to-one",
  quarterly_review: "Quarterly review",
  other: "Meeting",
};

export const KINDS = Object.keys(KIND_LABEL);

/** Is a rhythm meeting due on this date? Quarterly reviews fall in the first week of Jan, Apr, Jul and Oct. */
export function dueOn(r: Pick<Rhythm, "cadence" | "day" | "active">, iso: string, workingDays = DEFAULT_WORKING_DAYS): boolean {
  if (!r.active) return false;
  if (r.cadence === "daily") return isWorkingDay(iso, workingDays);
  if (r.cadence === "weekly") return weekday(iso) === (r.day ?? 1);
  if (r.cadence === "monthly") {
    const day = Math.min(r.day ?? 1, daysInMonth(monthOf(iso)));
    return Number(iso.slice(8, 10)) === day;
  }
  if (r.cadence === "quarterly") {
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return [1, 4, 7, 10].includes(m) && d <= 7 && weekday(iso) === 1;
  }
  return false;
}

export function cadenceText(r: Pick<Rhythm, "cadence" | "day" | "time">): string {
  const t = r.time ? ` at ${r.time}` : "";
  if (r.cadence === "daily") return `Every working day${t}`;
  if (r.cadence === "weekly") return `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][(r.day ?? 1) - 1]}${t}`;
  if (r.cadence === "monthly") return `Monthly on the ${ordinal(r.day ?? 1)}${t}`;
  return `Each quarter${t}`;
}

/** How many of the last N due dates a rhythm meeting was actually held. */
export async function compliance(rhythm: Rhythm[], today: string, workingDays: number[], lookbackDays = 14) {
  const from = addDays(today, -lookbackDays);
  const held = rhythm.length
    ? await db()
        .select({ rhythmId: schema.meetings.rhythmId, heldOn: schema.meetings.heldOn })
        .from(schema.meetings)
        .where(and(inArray(schema.meetings.rhythmId, rhythm.map((r) => r.id)), gte(schema.meetings.heldOn, from)))
    : [];
  const heldSet = new Set(held.map((h) => `${h.rhythmId}|${h.heldOn}`));
  return rhythm.map((r) => {
    const due: string[] = [];
    for (let d = addDays(today, -lookbackDays + 1); d <= today; d = addDays(d, 1)) if (dueOn(r, d, workingDays)) due.push(d);
    const done = due.filter((d) => heldSet.has(`${r.id}|${d}`)).length;
    return { rhythm: r, due: due.length, held: done, heldToday: heldSet.has(`${r.id}|${today}`), dueToday: dueOn(r, today, workingDays) };
  });
}

export async function recentMeetings(limit = 50) {
  return db().select().from(schema.meetings).orderBy(desc(schema.meetings.heldOn), desc(schema.meetings.createdAt)).limit(limit);
}

export async function meetingById(id: string) {
  return (await db().select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1))[0] ?? null;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

export { recentWorkingDays };
