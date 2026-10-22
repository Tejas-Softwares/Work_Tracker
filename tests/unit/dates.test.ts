import { describe, expect, it } from "vitest";
import * as d from "@/lib/domain/dates";

describe("dates", () => {
  it("uses India time for today", () => {
    // 22 Oct 2026, 19:00 UTC is 23 Oct 00:30 in India
    expect(d.todayISO(new Date("2026-10-22T19:00:00Z"))).toBe("2026-10-23");
    expect(d.todayISO(new Date("2026-10-22T18:00:00Z"))).toBe("2026-10-22");
  });
  it("does date arithmetic", () => {
    expect(d.addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(d.addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(d.diffDays("2026-10-22", "2026-11-02")).toBe(11);
    expect(d.weekday("2026-10-22")).toBe(4); // Thursday
    expect(d.weekday("2026-10-25")).toBe(7); // Sunday
    expect(d.startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(d.endOfWeek("2026-10-22")).toBe("2026-10-25");
  });
  it("counts working days Monday to Saturday", () => {
    expect(d.isWorkingDay("2026-10-25")).toBe(false);
    expect(d.recentWorkingDays("2026-10-26", 3)).toEqual(["2026-10-23", "2026-10-24", "2026-10-26"]);
    expect(d.workingDaysBetween("2026-10-22", "2026-10-27")).toBe(4); // Fri, Sat, Mon, Tue
    expect(d.nextWorkingDay("2026-10-25")).toBe("2026-10-26");
  });
  it("handles months", () => {
    expect(d.monthEnd("2026-02")).toBe("2026-02-28");
    expect(d.addMonths("2026-12", 1)).toBe("2027-01");
    expect(d.addMonths("2026-01", -1)).toBe("2025-12");
    expect(d.monthLabel("2026-10")).toBe("Oct 2026");
    expect(d.isMonth("2026-13")).toBe(false);
  });
  it("formats dates", () => {
    expect(d.formatDate("2026-10-22", "2026-10-01")).toBe("22 Oct");
    expect(d.formatDate("2027-01-05", "2026-10-01")).toBe("5 Jan 2027");
    expect(d.relativeDue("2026-10-22", "2026-10-22")).toBe("Today");
    expect(d.relativeDue("2026-10-19", "2026-10-22")).toBe("3 days late");
    expect(d.relativeDue("2026-10-24", "2026-10-22")).toBe("Sat");
    expect(d.isISODate("2026-02-30")).toBe(false);
  });
});
