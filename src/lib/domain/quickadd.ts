import type { RecurrenceRule } from "../db/schema";
import { addDays, daysInMonth, endOfWeek, isWorkingDay, monthOf, startOfWeek, weekday, DEFAULT_WORKING_DAYS, isISODate } from "./dates";
import { firstOccurrence, type Priority } from "./tasks";

/**
 * Quick add: one line becomes a task.
 *   "Send RA bill to Jabil @Ravi #Jabil-1800 !high by fri"
 *   "Site daily report @Kiran every day"
 *   "Monthly MIS @Pooja every month on 5th"
 * @name sets the owner, #tag the project, !high / !! the priority, words like today, fri, 25 Oct,
 * 25/10, in 3 days, eom the due date, and every day / every monday / every month on 5th makes it repeat.
 */

export type QuickPerson = { id: string; name: string };

export type QuickResult = {
  title: string;
  owner?: QuickPerson;
  ownerQuery?: string;
  ownerOptions?: QuickPerson[];
  due?: string;
  dueText?: string;
  priority?: Priority;
  project?: string;
  rule?: RecurrenceRule;
  ruleText?: string;
};

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_RE = "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const LEAD = "(?:(?:by|on|due|before|till|until)\\s+)?";

function monthIndex(s: string): number {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase()) + 1;
}

function dayIndex(s: string): number {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(s.slice(0, 3).toLowerCase()) + 1;
}

function makeDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const mm = `${y}-${String(m).padStart(2, "0")}`;
  if (d > daysInMonth(mm)) return null;
  return `${mm}-${String(d).padStart(2, "0")}`;
}

/** A day and month without a year: this year, or next year if that date has passed. */
function withYear(today: string, m: number, d: number, y?: number): string | null {
  if (y !== undefined) {
    const full = y < 100 ? 2000 + y : y;
    return makeDate(full, m, d);
  }
  const ty = Number(today.slice(0, 4));
  const iso = makeDate(ty, m, d);
  if (iso && iso < today) return makeDate(ty + 1, m, d);
  return iso;
}

function lastWorkingDayOnOrBefore(iso: string, wd: number[]): string {
  let d = iso;
  for (let i = 0; i < 7 && !isWorkingDay(d, wd); i++) d = addDays(d, -1);
  return d;
}

type Ctx = { text: string };

/** Finds the first match, removes it from ctx.text, returns it. */
function take(ctx: Ctx, re: RegExp): RegExpExecArray | null {
  const m = re.exec(ctx.text);
  if (!m) return null;
  ctx.text = (ctx.text.slice(0, m.index) + " " + ctx.text.slice(m.index + m[0].length)).replace(/\s+/g, " ");
  return m;
}

export function matchPeople(query: string, people: QuickPerson[]): QuickPerson[] {
  const parts = query.toLowerCase().split(/[._\-]+/).filter(Boolean);
  if (!parts.length) return [];
  const scored: { p: QuickPerson; score: number }[] = [];
  for (const p of people) {
    const words = p.name.toLowerCase().split(/\s+/).filter(Boolean);
    // every part must start a word, in order
    let wi = 0;
    let ok = true;
    let exact = 0;
    for (const part of parts) {
      while (wi < words.length && !words[wi].startsWith(part)) wi++;
      if (wi >= words.length) {
        ok = false;
        break;
      }
      if (words[wi] === part) exact++;
      wi++;
    }
    if (ok) scored.push({ p, score: exact * 10 + (words[0].startsWith(parts[0]) ? 5 : 0) });
  }
  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const top = scored.filter((s) => s.score === best);
  return (top.length === 1 ? top : scored).map((s) => s.p);
}

export function parseQuickAdd(
  input: string,
  opts: { today: string; people: QuickPerson[]; workingDays?: number[] },
): QuickResult {
  const today = opts.today;
  const wd = opts.workingDays ?? DEFAULT_WORKING_DAYS;
  const ctx: Ctx = { text: ` ${input.replace(/\s+/g, " ").trim()} ` };
  const r: QuickResult = { title: "" };

  // Repeat, before dates, so "every monday" is not read as a due date. "every …" can sit anywhere;
  // a bare "daily", "weekly" or "monthly" counts only at the end, so "Daily cash report" stays a title.
  let m: RegExpExecArray | null;
  if ((m = take(ctx, /\s(?:every\s+(?:working\s+)?day|every\s+weekday)(?=\s)/i)) || (m = take(ctx, /\sdaily\s$/i))) {
    r.rule = { type: "daily" };
  } else if ((m = take(ctx, new RegExp(`\\s(?:every|each)\\s+${DAY_RE}(?=\\s)`, "i")))) {
    r.rule = { type: "weekly", dow: dayIndex(m[1]) };
  } else if (
    (m = take(ctx, new RegExp(`\\severy\\s+week(?:\\s+on\\s+${DAY_RE})?(?=\\s)`, "i"))) ||
    (m = take(ctx, new RegExp(`\\sweekly(?:\\s+on\\s+${DAY_RE})?\\s$`, "i")))
  ) {
    r.rule = { type: "weekly", dow: m[1] ? dayIndex(m[1]) : weekday(today) };
  } else if (
    (m = take(ctx, /\s(?:every\s+month[-\s]?end|every\s+end\s+of\s+(?:the\s+)?month)(?=\s)/i)) ||
    (m = take(ctx, /\smonthly\s+on\s+(?:the\s+)?last\s+day\s$/i))
  ) {
    r.rule = { type: "monthly", dom: 31 };
  } else if (
    (m = take(ctx, /\severy\s+month(?:\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?)?(?=\s)/i)) ||
    (m = take(ctx, /\smonthly(?:\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\s$/i))
  ) {
    r.rule = { type: "monthly", dom: m[1] ? Math.min(31, Math.max(1, Number(m[1]))) : Number(today.slice(8, 10)) };
  } else if ((m = take(ctx, /\severy\s+(\d{1,2})(?:st|nd|rd|th)(?:\s+of\s+the\s+month)?(?=\s)/i))) {
    r.rule = { type: "monthly", dom: Math.min(31, Math.max(1, Number(m[1]))) };
  }
  if (r.rule) r.ruleText = m![0].trim();

  // Owner
  if ((m = take(ctx, /\s@([\p{L}][\p{L}\p{N}.'_-]*)(?=\s)/u))) {
    const q = m[1].replace(/[.'_-]+$/, "");
    r.ownerQuery = q;
    const found = matchPeople(q, opts.people);
    if (found.length === 1) r.owner = found[0];
    else if (found.length > 1) r.ownerOptions = found.slice(0, 6);
  }

  // Project
  if ((m = take(ctx, /\s#([\p{L}\p{N}][\p{L}\p{N}_\-/.]*)(?=\s)/u))) {
    r.project = m[1].replace(/[./-]+$/, "");
  }

  // Priority
  if ((m = take(ctx, /\s!(low|l|medium|med|m|high|hi|h|critical|crit|c|urgent|u)(?=\s)/i))) {
    const p = m[1].toLowerCase();
    r.priority = p.startsWith("l") ? "low" : p.startsWith("m") ? "medium" : p.startsWith("h") ? "high" : "critical";
  } else if ((m = take(ctx, /\s(!{1,3})(?=\s)/))) {
    r.priority = m[1].length >= 3 ? "critical" : "high";
  }

  // Due date
  const due = takeDue(ctx, today, wd);
  if (due) {
    r.due = due.iso;
    r.dueText = due.text;
  } else if (r.rule) {
    r.due = firstOccurrence(r.rule, today, wd);
  }

  r.title = cleanTitle(ctx.text);
  return r;
}

function takeDue(ctx: Ctx, today: string, wd: number[]): { iso: string; text: string } | null {
  let m: RegExpExecArray | null;
  const done = (iso: string | null, m: RegExpExecArray) => (iso ? { iso, text: m[0].trim() } : null);

  if ((m = take(ctx, new RegExp(`\\s${LEAD}(\\d{4})-(\\d{2})-(\\d{2})(?=\\s)`, "i")))) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return done(isISODate(iso) ? iso : null, m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:day\\s+after\\s+tomorrow)(?=\\s)`, "i")))) return done(addDays(today, 2), m);
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:today|tod|tonight|eod)(?=\\s)`, "i")))) return done(today, m);
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:tomorrow|tmrw|tmr|tom)(?=\\s)`, "i")))) return done(addDays(today, 1), m);
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:next\\s+week)(?=\\s)`, "i")))) return done(addDays(startOfWeek(today), 7), m);
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:eow|end\\s+of\\s+(?:the\\s+)?week|this\\s+week)(?=\\s)`, "i"))))
    return done(lastWorkingDayOnOrBefore(endOfWeek(today), wd), m);
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:eom|end\\s+of\\s+(?:the\\s+)?month|month[-\\s]end)(?=\\s)`, "i")))) {
    const month = monthOf(today);
    const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    return done(lastWorkingDayOnOrBefore(last, wd), m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}in\\s+(\\d{1,3})\\s+(working\\s+days?|days?|weeks?)(?=\\s)`, "i")))) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("working")) {
      let d = today;
      let left = n;
      for (let i = 0; i < 500 && left > 0; i++) {
        d = addDays(d, 1);
        if (isWorkingDay(d, wd)) left--;
      }
      return done(d, m);
    }
    return done(addDays(today, unit.startsWith("week") ? n * 7 : n), m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}next\\s+${DAY_RE}(?=\\s)`, "i")))) {
    return done(addDays(startOfWeek(today), 7 + dayIndex(m[1]) - 1), m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:,?\\s+(\\d{4}))?(?=\\s)`, "i")))) {
    return done(withYear(today, monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined), m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i")))) {
    return done(withYear(today, monthIndex(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined), m);
  }
  // dd/mm or dd-mm(-yyyy): only after "by", "on"… or at the very end, so "panel 2/3 wiring" stays a title.
  if (
    (m = take(ctx, /\s(?:by|on|due|before|till|until)\s+(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)/i)) ||
    (m = take(ctx, /\s(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s$/))
  ) {
    return done(withYear(today, Number(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined), m);
  }
  if ((m = take(ctx, new RegExp(`\\s${LEAD}(?:this\\s+)?${DAY_RE}(?=\\s)`, "i")))) {
    const target = dayIndex(m[1]);
    const diff = (target - weekday(today) + 7) % 7;
    return done(addDays(today, diff), m);
  }
  return null;
}

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  // words left hanging after a date or name was taken out
  t = t.replace(/\s+(?:by|on|due|before|till|until|for|to)$/i, "").replace(/^(?:by|on|due)\s+/i, "");
  t = t.replace(/\s+[-–,:;]+$/, "").replace(/^[-–,:;]+\s*/, "").trim();
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t;
}
