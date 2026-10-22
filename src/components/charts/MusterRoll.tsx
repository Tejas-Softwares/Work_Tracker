"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, cx } from "../ui/bits";

export type MusterPerson = { id: string; name: string; dept: string; counts: number[]; quietDays: number; activeDays: number; open: number; overdue: number; linked: boolean };

const FILL = ["#ffffff", "#c6d1ee", "#7d93cf", "#3f5db0"];
function level(c: number) {
  return c <= 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : 3;
}

/**
 * The muster roll: a row per person, a cell per working day, shaded by how much work they logged.
 * Like a site attendance register, an empty row is what you look for.
 */
export function MusterRoll({ people, days, dayLabels, idleAfter }: { people: MusterPerson[]; days: string[]; dayLabels: { short: string; full: string; monday: boolean }[]; idleAfter: number }) {
  const [sort, setSort] = useState<"quiet" | "name" | "dept">("quiet");
  const [hover, setHover] = useState<{ p: number; d: number } | null>(null);
  const [onlyQuiet, setOnlyQuiet] = useState(false);
  const rows = useMemo(() => {
    const r = people.filter((p) => !onlyQuiet || p.quietDays >= idleAfter);
    if (sort === "name") return [...r].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "dept") return [...r].sort((a, b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
    return [...r].sort((a, b) => b.quietDays - a.quietDays || a.activeDays - b.activeDays || a.name.localeCompare(b.name));
  }, [people, sort, onlyQuiet, idleAfter]);
  const quietCount = people.filter((p) => p.quietDays >= idleAfter).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-ink-2">Sort</span>
        {(["quiet", "dept", "name"] as const).map((s) => (
          <button key={s} type="button" className={cx("btn btn-sm", sort === s && "border-brand bg-brand-wash text-navy")} aria-pressed={sort === s} onClick={() => setSort(s)}>
            {s === "quiet" ? "Quietest first" : s === "dept" ? "Department" : "Name"}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5">
          <input type="checkbox" className="size-4 accent-brand" checked={onlyQuiet} onChange={(e) => setOnlyQuiet(e.target.checked)} /> Only quiet {idleAfter}+ days ({quietCount})
        </label>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3" aria-hidden="true">
          Less
          {FILL.map((f, i) => (
            <span key={i} className="inline-block size-3.5 rounded-[3px]" style={{ background: f, border: i ? "none" : "1px solid var(--color-line-strong)" }} />
          ))}
          More updates
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-separate border-spacing-0 text-[13px]" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-white px-3 py-2 text-left text-[12px] font-semibold text-ink-3">Person</th>
              {dayLabels.map((d, i) => (
                <th key={days[i]} className={cx("px-0 py-2 text-center text-[10.5px] font-normal text-ink-3", d.monday && i > 0 && "border-l border-line")} title={d.full} style={{ minWidth: 24 }}>
                  {d.short}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-[12px] font-semibold whitespace-nowrap text-ink-3">Quiet</th>
              <th className="px-3 py-2 text-right text-[12px] font-semibold whitespace-nowrap text-ink-3">Open, late</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, pi) => (
              <tr key={p.id} className="group">
                <td className="sticky left-0 z-[1] border-t border-line bg-white px-3 py-1.5 group-hover:bg-[#fafbfd]">
                  <Link href={`/team/${p.id}?tab=work`} className="flex min-w-[180px] items-center gap-2 hover:text-brand">
                    <Avatar name={p.name} size={22} />
                    <span className="min-w-0">
                      <span className="block truncate font-[550]">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-3">{p.dept}</span>
                    </span>
                  </Link>
                </td>
                {p.counts.map((c, di) => (
                  <td key={di} className={cx("border-t border-line p-[3px] text-center", dayLabels[di].monday && di > 0 && "border-l")} onMouseEnter={() => setHover({ p: pi, d: di })}>
                    <span
                      className="mx-auto block size-[18px] rounded-[3px]"
                      style={{ background: FILL[level(c)], border: c ? "none" : "1px solid var(--color-line-strong)", outline: hover?.p === pi && hover?.d === di ? "2px solid var(--color-navy)" : undefined }}
                      title={`${p.name}, ${dayLabels[di].full}: ${c} update${c === 1 ? "" : "s"}`}
                    />
                  </td>
                ))}
                <td className="num border-t border-line px-3 py-1.5 text-right whitespace-nowrap" style={{ color: p.quietDays >= idleAfter ? "var(--color-phase-y)" : "var(--color-ink-3)", fontWeight: p.quietDays >= idleAfter ? 600 : 400 }}>
                  {!p.linked && p.activeDays === 0 ? "no login" : p.quietDays === 0 ? "today" : `${p.quietDays} days`}
                </td>
                <td className="num border-t border-line px-3 py-1.5 text-right whitespace-nowrap text-ink-2">
                  {p.open}
                  {p.overdue ? <span className="text-phase-y">, {p.overdue} late</span> : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hover && rows[hover.p] && (
        <p className="mt-2 text-[12.5px] text-ink-2" aria-live="polite">
          {rows[hover.p].name}, {dayLabels[hover.d].full}: {rows[hover.p].counts[hover.d]} update{rows[hover.p].counts[hover.d] === 1 ? "" : "s"} logged.
        </p>
      )}
    </div>
  );
}
