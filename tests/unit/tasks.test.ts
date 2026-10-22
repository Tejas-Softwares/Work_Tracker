import { describe, expect, it } from "vitest";
import * as t from "@/lib/domain/tasks";

const today = "2026-10-22";
const done = (due: string, completed: string) => ({ status: "done", dueDate: due, completedAt: new Date(`${completed}T10:00:00+05:30`) });
const open = (due: string | null, status = "todo") => ({ status, dueDate: due, completedAt: null });

describe("overdue and buckets", () => {
  it("is overdue only when open and past due", () => {
    expect(t.isOverdue(open("2026-10-21"), today)).toBe(true);
    expect(t.isOverdue(open("2026-10-22"), today)).toBe(false);
    expect(t.isOverdue(done("2026-10-01", "2026-10-05"), today)).toBe(false);
    expect(t.daysLate(open("2026-10-19"), today)).toBe(3);
  });
  it("buckets by due date", () => {
    expect(t.dueBucket(open("2026-10-20"), today)).toBe("overdue");
    expect(t.dueBucket(open(today), today)).toBe("today");
    expect(t.dueBucket(open("2026-10-25"), today)).toBe("week");
    expect(t.dueBucket(open("2026-10-26"), today)).toBe("later");
    expect(t.dueBucket(open(null), today)).toBe("none");
    expect(t.dueBucket(done(today, today), today)).toBe("closed");
  });
});

describe("period stats", () => {
  it("counts on-time delivery", () => {
    const tasks = [
      done("2026-10-05", "2026-10-05"), // on time
      done("2026-10-06", "2026-10-08"), // late
      open("2026-10-10"), // late, still open
      open("2026-10-28"), // not matured
      { status: "cancelled", dueDate: "2026-10-07", completedAt: null },
      open("2026-09-30", "blocked"), // overdue from last month
    ];
    const s = t.periodStats(tasks, "2026-10-01", "2026-10-31", today);
    expect(s.due).toBe(4);
    expect(s.matured).toBe(3);
    expect(s.onTime).toBe(1);
    expect(s.late).toBe(2);
    expect(s.onTimePct).toBe(33);
    expect(s.overdueNow).toBe(2);
    expect(s.blocked).toBe(1);
    expect(s.doneInPeriod).toBe(2);
  });
  it("returns null when nothing matured", () => {
    expect(t.periodStats([open("2026-11-02")], "2026-10-01", "2026-10-31", today).onTimePct).toBeNull();
  });
  it("maps on-time % to a score", () => {
    expect(t.onTimeToScore(96)).toBe(5);
    expect(t.onTimeToScore(85)).toBe(4);
    expect(t.onTimeToScore(70)).toBe(3);
    expect(t.onTimeToScore(55)).toBe(2);
    expect(t.onTimeToScore(10)).toBe(1);
    expect(t.onTimeToScore(null)).toBeNull();
  });
  it("uses India time for the completion date", () => {
    // 23:30 on 5 Oct in India is still 5 Oct
    const late = { status: "done", dueDate: "2026-10-05", completedAt: new Date("2026-10-05T18:00:00Z") };
    expect(t.wasOnTime(late)).toBe(true);
    const next = { status: "done", dueDate: "2026-10-05", completedAt: new Date("2026-10-05T18:40:00Z") };
    expect(t.wasOnTime(next)).toBe(false);
  });
});

describe("recurrence", () => {
  it("daily skips Sundays", () => {
    expect(t.occurrences({ type: "daily" }, "2026-10-23", "2026-10-27")).toEqual(["2026-10-24", "2026-10-26", "2026-10-27"]);
  });
  it("weekly lands on the weekday", () => {
    expect(t.occurrences({ type: "weekly", dow: 1 }, "2026-10-22", "2026-11-10")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });
  it("monthly clamps to the month's last day", () => {
    expect(t.occurrences({ type: "monthly", dom: 31 }, "2027-01-31", "2027-04-30")).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(t.occurrences({ type: "monthly", dom: 5 }, "2026-10-22", "2026-12-31")).toEqual(["2026-11-05", "2026-12-05"]);
    expect(t.matchesRule({ type: "monthly", dom: 30 }, "2027-02-28")).toBe(true);
  });
  it("finds the first occurrence", () => {
    expect(t.firstOccurrence({ type: "weekly", dow: 4 }, "2026-10-22")).toBe("2026-10-22");
    expect(t.firstOccurrence({ type: "daily" }, "2026-10-25")).toBe("2026-10-26");
  });
  it("creates only what is due, with lead time, without flooding after a pause", () => {
    // weekly Monday report, 2 days' lead: on Sat 24 Oct the 26 Oct task appears
    expect(t.dueDatesToCreate({ type: "weekly", dow: 1 }, "2026-10-19", "2026-10-24", 2, "2026-10-24")).toEqual(["2026-10-26"]);
    // already created
    expect(t.dueDatesToCreate({ type: "weekly", dow: 1 }, "2026-10-26", "2026-10-24", 2, "2026-10-24")).toEqual([]);
    // series last ran in August: only catch up from the catch-up date
    expect(t.dueDatesToCreate({ type: "daily" }, "2026-08-10", "2026-10-22", 0, "2026-10-21")).toEqual(["2026-10-21", "2026-10-22"]);
  });
  it("describes rules", () => {
    expect(t.describeRule({ type: "monthly", dom: 5 })).toBe("Every month on the 5th");
    expect(t.describeRule({ type: "monthly", dom: 22 })).toBe("Every month on the 22nd");
    expect(t.describeRule({ type: "weekly", dow: 3 })).toBe("Every Wednesday");
    expect(t.isRule({ type: "weekly", dow: 9 })).toBe(false);
  });
});
