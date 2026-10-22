import type { RecurrenceRule } from "../db/schema";
import {
  addDays,
  daysInMonth,
  diffDays,
  endOfWeek,
  isWorkingDay,
  isoDate,
  monthOf,
  weekday,
  DEFAULT_WORKING_DAYS,
  addMonths,
} from "./dates";

export const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const OPEN_STATUSES: Status[] = ["todo", "in_progress", "blocked"];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
export const PRIORITY_WEIGHT: Record<Priority, number> = { low: 1, medium: 2, high: 3, critical: 5 };

export const SOURCES = [
  "self",
  "director",
  "huddle",
  "project_review",
  "management_review",
  "monthly_review",
  "one_to_one",
  "client",
  "email",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  self: "Own work",
  director: "Director's instruction",
  huddle: "Daily huddle",
  project_review: "Project review",
  management_review: "Management review",
  monthly_review: "Monthly business review",
  one_to_one: "One-to-one",
  client: "Client request",
  email: "Email",
  other: "Other",
};

export function isStatus(s: unknown): s is Status {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s);
}
export function isPriority(s: unknown): s is Priority {
  return typeof s === "string" && (PRIORITIES as readonly string[]).includes(s);
}
export function isSource(s: unknown): s is Source {
  return typeof s === "string" && (SOURCES as readonly string[]).includes(s);
}

export type TaskLike = {
  status: string;
  dueDate: string | null;
  completedAt: Date | string | null;
  priority?: string;
  slips?: number;
};

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as string[]).includes(status);
}

export function isOverdue(t: TaskLike, today: string): boolean {
  return isOpen(t.status) && !!t.dueDate && t.dueDate < today;
}

export function daysLate(t: TaskLike, today: string): number {
  return isOverdue(t, today) ? diffDays(t.dueDate!, today) : 0;
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none" | "closed";

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "This week",
  later: "Later",
  none: "No due date",
  closed: "Closed",
};

export function dueBucket(t: TaskLike, today: string): DueBucket {
  if (!isOpen(t.status)) return "closed";
  if (!t.dueDate) return "none";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  if (t.dueDate <= endOfWeek(today)) return "week";
  return "later";
}

/** The India-time calendar date a task was completed on. */
export function completedOn(t: TaskLike): string | null {
  if (!t.completedAt) return null;
  return isoDate(typeof t.completedAt === "string" ? new Date(t.completedAt) : t.completedAt);
}

export function wasOnTime(t: TaskLike): boolean | null {
  if (t.status !== "done" || !t.dueDate) return null;
  const c = completedOn(t);
  return c !== null && c <= t.dueDate;
}

export type PeriodStats = {
  /** Tasks due in the period (cancelled excluded). */
  due: number;
  /** Of those, the ones whose due date has passed or that are already done: the ones that count. */
  matured: number;
  onTime: number;
  late: number;
  /** Open tasks past their due date right now (any period). */
  overdueNow: number;
  open: number;
  doneInPeriod: number;
  blocked: number;
  slips: number;
  /** onTime / matured, 0–100, or null when nothing has matured. */
  onTimePct: number | null;
};

/**
 * On-time delivery for a period. A task counts once its due date has passed or it is done:
 * done on or before the due date is on time; done after, or still open past the date, is late.
 */
export function periodStats(tasks: TaskLike[], from: string, to: string, today: string): PeriodStats {
  const s: PeriodStats = { due: 0, matured: 0, onTime: 0, late: 0, overdueNow: 0, open: 0, doneInPeriod: 0, blocked: 0, slips: 0, onTimePct: null };
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    if (isOpen(t.status)) s.open++;
    if (t.status === "blocked") s.blocked++;
    if (isOverdue(t, today)) s.overdueNow++;
    const c = completedOn(t);
    if (t.status === "done" && c && c >= from && c <= to) s.doneInPeriod++;
    if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
    s.due++;
    s.slips += t.slips ?? 0;
    if (t.status === "done") {
      s.matured++;
      if (c && c <= t.dueDate) s.onTime++;
      else s.late++;
    } else if (t.dueDate < today) {
      s.matured++;
      s.late++;
    }
  }
  s.onTimePct = s.matured ? Math.round((s.onTime / s.matured) * 100) : null;
  return s;
}

/** Suggested 1–5 score for "delivers on time" from an on-time percentage. */
export function onTimeToScore(pct: number | null): number | null {
  if (pct === null) return null;
  if (pct >= 95) return 5;
  if (pct >= 85) return 4;
  if (pct >= 70) return 3;
  if (pct >= 50) return 2;
  return 1;
}

export function workload(tasks: TaskLike[]): number {
  return tasks.filter((t) => isOpen(t.status)).reduce((n, t) => n + (PRIORITY_WEIGHT[(t.priority as Priority) ?? "medium"] ?? 2), 0);
}

// ---------------------------------------------------------------- recurrence

export function describeRule(rule: RecurrenceRule): string {
  if (rule.type === "daily") return "Every working day";
  if (rule.type === "weekly") return `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][rule.dow - 1]}`;
  const n = rule.dom;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return n >= 31 ? "Last day of every month" : `Every month on the ${n}${suffix}`;
}

export function isRule(r: unknown): r is RecurrenceRule {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (o.type === "daily") return true;
  if (o.type === "weekly") return typeof o.dow === "number" && o.dow >= 1 && o.dow <= 7;
  if (o.type === "monthly") return typeof o.dom === "number" && o.dom >= 1 && o.dom <= 31;
  return false;
}

/** Does `iso` fall on the rule? Monthly days past the month's end land on its last day. */
export function matchesRule(rule: RecurrenceRule, iso: string, workingDays: number[] = DEFAULT_WORKING_DAYS): boolean {
  if (rule.type === "daily") return isWorkingDay(iso, workingDays);
  if (rule.type === "weekly") return weekday(iso) === rule.dow;
  const day = Number(iso.slice(8, 10));
  const last = daysInMonth(monthOf(iso));
  return day === Math.min(rule.dom, last);
}

/** Due dates on the rule, after `after` (exclusive) and up to `until` (inclusive), oldest first. */
export function occurrences(
  rule: RecurrenceRule,
  after: string,
  until: string,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
  limit = 400,
): string[] {
  const out: string[] = [];
  if (until <= after) return out;
  if (rule.type === "monthly") {
    let m = monthOf(addDays(after, 1));
    while (out.length < limit) {
      const day = Math.min(rule.dom, daysInMonth(m));
      const iso = `${m}-${String(day).padStart(2, "0")}`;
      if (iso > until) break;
      if (iso > after) out.push(iso);
      m = addMonths(m, 1);
    }
    return out;
  }
  for (let d = addDays(after, 1); d <= until && out.length < limit; d = addDays(d, 1)) {
    if (matchesRule(rule, d, workingDays)) out.push(d);
  }
  return out;
}

/** The first date on or after `from` that falls on the rule. */
export function firstOccurrence(rule: RecurrenceRule, from: string, workingDays: number[] = DEFAULT_WORKING_DAYS): string {
  return occurrences(rule, addDays(from, -1), addDays(from, 62), workingDays, 1)[0] ?? from;
}

/**
 * Which series due dates need a task now. A task appears `leadDays` before its due date. Dates the series has
 * already produced (up to lastDue) are skipped, and a long gap catches up only from `catchUpFrom`, so a series
 * paused for months does not flood someone with old tasks.
 */
export function dueDatesToCreate(
  rule: RecurrenceRule,
  lastDue: string | null,
  today: string,
  leadDays: number,
  catchUpFrom: string,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
): string[] {
  const start = lastDue && lastDue >= catchUpFrom ? lastDue : addDays(catchUpFrom, -1);
  return occurrences(rule, start, addDays(today, Math.max(0, leadDays)), workingDays);
}
