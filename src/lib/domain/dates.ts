/**
 * Calendar dates are plain "YYYY-MM-DD" strings in India time. Arithmetic is done on UTC midnights so
 * daylight saving and server time zones never shift a date.
 */

export const TZ = "Asia/Kolkata";
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday to Saturday

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar date of a moment, in India time. */
export function isoDate(d: Date): string {
  return fmt.format(d);
}

export function todayISO(now: Date = new Date()): string {
  return isoDate(now);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 1 = Monday … 7 = Sunday. */
export function weekday(iso: string): number {
  const d = toUTC(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isWorkingDay(iso: string, workingDays: number[] = DEFAULT_WORKING_DAYS): boolean {
  return workingDays.includes(weekday(iso));
}

/** The n most recent working days up to and including `iso`, oldest first. */
export function recentWorkingDays(iso: string, n: number, workingDays: number[] = DEFAULT_WORKING_DAYS): string[] {
  const out: string[] = [];
  let d = iso;
  let guard = 0;
  while (out.length < n && guard++ < n * 3 + 14) {
    if (isWorkingDay(d, workingDays)) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

/** Working days strictly after a and up to b. */
export function workingDaysBetween(a: string, b: string, workingDays: number[] = DEFAULT_WORKING_DAYS): number {
  if (b <= a) return 0;
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isWorkingDay(d, workingDays)) n++;
  return n;
}

export function nextWorkingDay(iso: string, workingDays: number[] = DEFAULT_WORKING_DAYS): string {
  let d = iso;
  for (let i = 0; i < 14 && !isWorkingDay(d, workingDays); i++) d = addDays(d, 1);
  return d;
}

/** Monday of the week containing iso. */
export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - weekday(iso));
}

export function endOfWeek(iso: string): string {
  return addDays(iso, 7 - weekday(iso));
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUTC(d).slice(0, 7);
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split("-").map(Number);
  const names = long
    ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : MONTHS;
  return `${names[m - 1]} ${y}`;
}

/** "22 Oct", with the year when it is not the current year. */
export function formatDate(iso: string | null | undefined, today: string = todayISO()): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return String(y) === today.slice(0, 4) ? base : `${base} ${y}`;
}

/** "Thu 22 Oct". */
export function formatDay(iso: string, today: string = todayISO()): string {
  return `${WEEKDAYS[weekday(iso) - 1]} ${formatDate(iso, today)}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[weekday(iso) - 1];
}

/** How a due date reads next to a task: "Today", "Tomorrow", "Fri", "3 days late", "28 Oct". */
export function relativeDue(due: string, today: string): string {
  const n = diffDays(today, due);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days late`;
  if (n < 7) return WEEKDAYS[weekday(due) - 1];
  return formatDate(due, today);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** "2 h ago", "yesterday", "5 Oct". */
export function timeAgo(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = diffDays(isoDate(date), isoDate(now));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(isoDate(date), isoDate(now));
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
