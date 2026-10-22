import { describe, expect, it } from "vitest";
import * as s from "@/lib/domain/scoring";
import { rag, formatKpi, toNumber } from "@/lib/domain/kpi";
import { buildMuster, musterLevel } from "@/lib/domain/muster";

describe("scorecards", () => {
  it("weights KRAs and blends behaviours 70/30", () => {
    const avg = s.kraAverage([
      { score: 4, weight: 40 },
      { score: 3, weight: 30 },
      { score: 2, weight: 30 },
    ]);
    expect(avg).toBe(3.1);
    expect(s.overallScore(avg, 4)).toBe(3.37);
    expect(s.overallScore(null, 4)).toBe(4);
    expect(s.overallScore(null, null)).toBeNull();
    expect(s.kraAverage([{ score: null, weight: 50 }, { score: 5, weight: 50 }])).toBe(5);
  });
  it("bands scores", () => {
    expect(s.band(4.6)).toBe("outstanding");
    expect(s.band(3.5)).toBe("strong");
    expect(s.band(3)).toBe("meets");
    expect(s.band(2.4)).toBe("below");
    expect(s.band(1.2)).toBe("unsatisfactory");
  });
  it("suggests a plan after two months below 3", () => {
    const h = [
      { month: "2026-11", overall: 2.8 },
      { month: "2026-12", overall: 2.6 },
    ];
    expect(s.suggestsPlan(h, "2026-12")).toBe(true);
    expect(s.suggestsPlan(h, "2026-11")).toBe(false);
    expect(s.suggestsPlan([{ month: "2026-12", overall: 2.6 }, { month: "2026-11", overall: 3.1 }], "2026-12")).toBe(false);
  });
  it("normalises weights to 100", () => {
    expect(s.normaliseWeights([1, 1, 1])).toEqual([34, 33, 33]);
    expect(s.normaliseWeights([30, 30, 20, 20])).toEqual([30, 30, 20, 20]);
    expect(s.normaliseWeights([50, 50, 50, 50]).reduce((a, b) => a + b)).toBe(100);
  });
});

describe("KPIs", () => {
  it("rates against target", () => {
    expect(rag(100, 100, "higher")).toBe("green");
    expect(rag(92, 100, "higher")).toBe("amber");
    expect(rag(80, 100, "higher")).toBe("red");
    expect(rag(5, 5, "lower")).toBe("green");
    expect(rag(5.4, 5, "lower")).toBe("amber");
    expect(rag(7, 5, "lower")).toBe("red");
    expect(rag(0, 0, "lower")).toBe("green");
    expect(rag(1, 0, "lower")).toBe("red");
    expect(rag(null, 5, "lower")).toBeNull();
  });
  it("formats and reads values", () => {
    expect(formatKpi(95, "%")).toBe("95%");
    expect(formatKpi(4, "days")).toBe("4 days");
    expect(toNumber("1,20,000")).toBe(120000);
    expect(toNumber("92%")).toBe(92);
    expect(toNumber("abc")).toBeNull();
  });
});

describe("muster roll", () => {
  it("counts work per day and quiet days", () => {
    const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
    const rows = buildMuster(
      ["a", "b"],
      [
        { personId: "a", day: "2026-10-19" },
        { personId: "a", day: "2026-10-22" },
        { personId: "a", day: "2026-10-22" },
        { personId: "b", day: "2026-10-19" },
        { personId: "z", day: "2026-10-19" },
      ],
      days,
    );
    expect(rows[0].counts).toEqual([1, 0, 0, 2]);
    expect(rows[0].quietDays).toBe(0);
    expect(rows[1].quietDays).toBe(3);
    expect(rows[1].activeDays).toBe(1);
    expect(musterLevel(0)).toBe(0);
    expect(musterLevel(7)).toBe(3);
  });
});
