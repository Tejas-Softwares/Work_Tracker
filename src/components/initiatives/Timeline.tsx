/** Milestones placed to scale between the initiative's start and end, with today marked. */
export function Timeline({
  start,
  end,
  today,
  milestones,
}: {
  start: string;
  end: string;
  today: string;
  milestones: { id: string; name: string; dueDate: string | null; status: string }[];
}) {
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
  const lo = t(start);
  const hi = Math.max(t(end), lo + 1);
  const W = 1000;
  const pad = 24;
  const X = (d: string) => pad + ((t(d) - lo) / (hi - lo)) * (W - 2 * pad);
  const dated = milestones.filter((m) => m.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
  // month ticks
  const ticks: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7)) + 1;
  for (let i = 0; i < 36; i++) {
    if (m > 12) {
      m = 1;
      y++;
    }
    const d = `${y}-${String(m).padStart(2, "0")}-01`;
    if (d > end) break;
    ticks.push(d);
    m++;
  }
  const color = (s: string) => (s === "met" ? "var(--color-earth-mark)" : s === "missed" ? "var(--color-phase-r)" : "var(--color-brand)");
  const showToday = today >= start && today <= end;
  const rows = dated.length;
  const H = 70 + rows * 26;
  return (
    <figure className="m-0 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label={`Timeline from ${day(start)} to ${day(end)} with ${dated.length} milestones`}>
        <line x1={pad} x2={W - pad} y1={40} y2={40} stroke="var(--color-line-strong)" strokeWidth={1.5} />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={X(d)} x2={X(d)} y1={34} y2={H - 6} stroke="var(--color-line)" />
            <text x={X(d) + 4} y={28} fontSize={12} fill="var(--color-ink-3)">
              {MONTHS[Number(d.slice(5, 7)) - 1]}
            </text>
          </g>
        ))}
        <text x={pad} y={58} fontSize={11.5} fill="var(--color-ink-3)">
          {day(start)}
        </text>
        <text x={W - pad} y={58} fontSize={11.5} fill="var(--color-ink-3)" textAnchor="end">
          {day(end)}
        </text>
        {showToday && (
          <g>
            <line x1={X(today)} x2={X(today)} y1={30} y2={H - 6} stroke="var(--color-navy)" strokeDasharray="4 4" strokeWidth={1.25} />
            <text x={X(today) + 4} y={16} fontSize={12} fontWeight={600} fill="var(--color-navy)">
              Today
            </text>
          </g>
        )}
        {dated.map((ms, i) => {
          const x = X(ms.dueDate!);
          const yy = 80 + i * 26;
          const right = x < W * 0.62;
          return (
            <g key={ms.id}>
              <line x1={x} x2={x} y1={40} y2={yy} stroke={color(ms.status)} strokeOpacity={0.35} />
              <path d={`M${x} ${yy - 7}l7 7l-7 7l-7 -7z`} fill={ms.status === "pending" ? "#fff" : color(ms.status)} stroke={color(ms.status)} strokeWidth={2} />
              <text x={right ? x + 13 : x - 13} y={yy + 4} fontSize={13} textAnchor={right ? "start" : "end"} fill="var(--color-ink)">
                {ms.name}
                <tspan fill="var(--color-ink-3)">{`  ${day(ms.dueDate!)}${ms.status === "met" ? ", met" : ms.status === "missed" ? ", missed" : ms.dueDate! < today ? ", due" : ""}`}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
