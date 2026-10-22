"use client";

import { useState } from "react";

/** Column chart of one measure, with a hover tooltip and the values in a table for screen readers. */
export function Columns({
  data,
  label,
  height = 140,
  format = (n: number) => String(n),
  color = "var(--color-brand)",
  highlightLast = true,
}: {
  data: { key: string; label: string; value: number | null; note?: string }[];
  label: string;
  height?: number;
  format?: (n: number) => string;
  color?: string;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const nice = niceMax(max);
  const W = 100 / data.length;
  return (
    <figure className="relative m-0">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
            <span className="num absolute -top-2 right-full mr-1.5 text-[10.5px] text-ink-3">{format(Math.round(nice * f))}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const h = d.value === null ? 0 : (d.value / nice) * 100;
            const last = highlightLast && i === data.length - 1;
            return (
              <div key={d.key} className="relative flex h-full items-end justify-center" style={{ width: `${W}%` }} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${d.value === null ? "no data" : format(d.value)}`}>
                {d.value !== null && (
                  <div
                    className="w-[min(24px,60%)] rounded-t-[4px]"
                    style={{ height: `${Math.max(h, d.value > 0 ? 2 : 0)}%`, background: color, opacity: hover === null ? (last ? 1 : 0.55) : hover === i ? 1 : 0.35, transition: "opacity .12s" }}
                  />
                )}
                {last && d.value !== null && hover === null && (
                  <span className="num absolute text-[11.5px] font-semibold text-ink" style={{ bottom: `calc(${h}% + 4px)` }}>
                    {format(d.value)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {hover !== null && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]" style={{ left: `${(hover + 0.5) * W}%`, bottom: `calc(${((data[hover].value ?? 0) / nice) * 100}% + 10px)` }}>
            <div className="font-semibold">{data[hover].label}</div>
            <div className="num text-ink-2">
              {data[hover].value === null ? "No data" : format(data[hover].value!)} {label}
            </div>
            {data[hover].note && <div className="text-ink-3">{data[hover].note}</div>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex">
        {data.map((d, i) => (
          <span key={d.key} className="truncate text-center text-[10.5px] text-ink-3" style={{ width: `${W}%`, fontWeight: i === data.length - 1 ? 600 : 400 }}>
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{d.label}</th>
              <td>{d.value === null ? "no data" : format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Line of a percentage over time, 0–100, with a target line. */
export function PercentLine({ data, target, height = 140, label }: { data: { key: string; label: string; value: number | null; note?: string }[]; target?: number; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - v;
  const pts = data.map((d, i) => (d.value === null ? null : { x: x(i), y: y(d.value), d, i })).filter(Boolean) as { x: number; y: number; d: (typeof data)[number]; i: number }[];
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <figure className="relative m-0">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((v) => (
          <div key={v} className="absolute inset-x-0 border-t border-line" style={{ top: `${y(v)}%` }}>
            <span className="num absolute -top-2 right-full mr-1.5 text-[10.5px] text-ink-3">{v}%</span>
          </div>
        ))}
        {target !== undefined && (
          <div className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(target)}%`, borderColor: "var(--color-earth-mark)" }}>
            <span className="absolute right-0 -top-4 text-[10.5px] text-earth">target {target}%</span>
          </div>
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <path d={path} fill="none" stroke="var(--color-navy)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {pts.map((p) => (
          <span
            key={p.d.key}
            className="absolute block size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: "var(--color-navy)", transform: `translate(-50%,-50%) scale(${hover === p.i ? 1.35 : 1})` }}
          />
        ))}
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <div key={d.key} className="h-full flex-1" onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} aria-label={`${d.label}: ${d.value === null ? "nothing due" : `${d.value}%`}`} />
          ))}
        </div>
        {last && hover === null && (
          <span className="num absolute text-[11.5px] font-semibold" style={{ left: `${last.x}%`, top: `${last.y}%`, transform: "translate(-110%, -150%)" }}>
            {last.d.value}%
          </span>
        )}
        {hover !== null && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]" style={{ left: `${x(hover)}%`, top: `calc(${data[hover].value === null ? 50 : y(data[hover].value!)}% + 12px)` }}>
            <div className="font-semibold">{data[hover].label}</div>
            <div className="num text-ink-2">{data[hover].value === null ? "Nothing due" : `${data[hover].value}% ${label}`}</div>
            {data[hover].note && <div className="text-ink-3">{data[hover].note}</div>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between">
        {data.map((d, i) => (
          <span key={d.key} className="text-[10.5px] text-ink-3" style={{ fontWeight: i === n - 1 ? 600 : 400 }}>
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{d.label}</th>
              <td>{d.value === null ? "nothing due" : `${d.value}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
