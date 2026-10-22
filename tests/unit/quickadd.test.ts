import { describe, expect, it } from "vitest";
import { parseQuickAdd, matchPeople } from "@/lib/domain/quickadd";

const people = [
  { id: "1", name: "Hemant Jagtap" },
  { id: "2", name: "Arun Bhosale" },
  { id: "3", name: "Kavita Jadhav" },
  { id: "4", name: "Priya Jadhav" },
  { id: "5", name: "Yogesh Nikam" },
  { id: "6", name: "Yash Kale" },
];
const today = "2026-10-22"; // Thursday
const p = (s: string) => parseQuickAdd(s, { today, people });

describe("quick add", () => {
  it("reads owner, project, priority and weekday", () => {
    const r = p("Send RA bill to Jabil @Hemant #Jabil-1800 !high by fri");
    expect(r.title).toBe("Send RA bill to Jabil");
    expect(r.owner?.id).toBe("1");
    expect(r.project).toBe("Jabil-1800");
    expect(r.priority).toBe("high");
    expect(r.due).toBe("2026-10-23");
  });
  it("reads today, tomorrow and next week", () => {
    expect(p("Call MSEDCL today").due).toBe(today);
    expect(p("Call MSEDCL tomorrow").due).toBe("2026-10-23");
    expect(p("Vendor visit next week").due).toBe("2026-10-26");
    expect(p("Vendor visit next tue").due).toBe("2026-10-27");
    expect(p("Review thu").due).toBe(today);
  });
  it("reads day-month dates", () => {
    expect(p("Submit tender 25 Oct").due).toBe("2026-10-25");
    expect(p("Submit tender oct 25th").due).toBe("2026-10-25");
    expect(p("Submit tender by 5/11").due).toBe("2026-11-05");
    expect(p("Annual audit 3 Jan").due).toBe("2027-01-03");
    expect(p("Board meeting 2026-12-01").due).toBe("2026-12-01");
  });
  it("leaves numbers in titles alone", () => {
    const r = p("Panel 2/3 wiring check @Arun");
    expect(r.title).toBe("Panel 2/3 wiring check");
    expect(r.due).toBeUndefined();
  });
  it("reads relative dates", () => {
    expect(p("Follow up in 3 days").due).toBe("2026-10-25");
    expect(p("Follow up in 2 weeks").due).toBe("2026-11-05");
    expect(p("Follow up in 2 working days").due).toBe("2026-10-24");
    expect(p("Close books eom").due).toBe("2026-10-31");
    expect(p("Send summary eow").due).toBe("2026-10-24");
  });
  it("reads repeats", () => {
    const daily = p("Site daily report @Arun every day");
    expect(daily.rule).toEqual({ type: "daily" });
    expect(daily.due).toBe(today);
    expect(daily.title).toBe("Site daily report");
    const weekly = p("Weekly bid pipeline update every monday !h");
    expect(weekly.rule).toEqual({ type: "weekly", dow: 1 });
    expect(weekly.due).toBe("2026-10-26");
    expect(weekly.priority).toBe("high");
    const monthly = p("Monthly MIS every month on 5th @yogesh");
    expect(monthly.rule).toEqual({ type: "monthly", dom: 5 });
    expect(monthly.due).toBe("2026-11-05");
    expect(monthly.owner?.id).toBe("5");
    expect(p("Payroll every month end").rule).toEqual({ type: "monthly", dom: 31 });
  });
  it("uses !! for priority", () => {
    expect(p("Fix gate pass !!").priority).toBe("high");
    expect(p("Fix gate pass !!!").priority).toBe("critical");
    expect(p("Fix gate pass !c").priority).toBe("critical");
  });
  it("offers choices when a name is ambiguous", () => {
    const r = p("Check drawings @jadhav");
    expect(r.owner).toBeUndefined();
    expect(r.ownerOptions?.length).toBeGreaterThan(1);
    expect(matchPeople("y.kale", people).map((x) => x.id)).toEqual(["6"]);
    expect(matchPeople("jadhav", people).map((x) => x.id).sort()).toEqual(["3", "4"]);
    expect(matchPeople("kavita", people).map((x) => x.id)).toEqual(["3"]);
  });
  it("keeps the title when nothing is recognised", () => {
    const r = p("prepare cable schedule for block B");
    expect(r.title).toBe("Prepare cable schedule for block B");
    expect(r.due).toBeUndefined();
  });
});

describe("quick add repeat keywords", () => {
  it("keeps daily/weekly/monthly in titles unless at the end", () => {
    const r = parseQuickAdd("Daily cash report @yogesh", { today, people });
    expect(r.rule).toBeUndefined();
    expect(r.title).toBe("Daily cash report");
    expect(parseQuickAdd("Cash report daily", { today, people }).rule).toEqual({ type: "daily" });
    expect(parseQuickAdd("Stock count monthly on 28th", { today, people }).rule).toEqual({ type: "monthly", dom: 28 });
    expect(parseQuickAdd("Vendor rating weekly", { today, people }).rule).toEqual({ type: "weekly", dow: 4 });
  });
});
