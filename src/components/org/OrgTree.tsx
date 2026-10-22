"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Minus } from "lucide-react";
import { Avatar, cx } from "../ui/bits";

export type OrgNode = {
  id: string;
  name: string;
  designation: string;
  dept: string;
  deptCode: string;
  vacancy: boolean;
  reportsTo: string | null;
  dotted: string;
  open?: number;
  overdue?: number;
  onTime?: number | null;
  quietDays?: number;
  linked: boolean;
};

export function OrgTree({ nodes, idleAfter }: { nodes: OrgNode[]; idleAfter: number }) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = useMemo(() => {
    const m = new Map<string | null, OrgNode[]>();
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      const parent = n.reportsTo && ids.has(n.reportsTo) ? n.reportsTo : null;
      if (!m.has(parent)) m.set(parent, []);
      m.get(parent)!.push(n);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.vacancy) - Number(b.vacancy) || (m.get(b.id)?.length ?? 0) - (m.get(a.id)?.length ?? 0) || a.name.localeCompare(b.name));
    return m;
  }, [nodes]);
  const s = q.trim().toLowerCase();
  const match = (n: OrgNode) => !s || n.name.toLowerCase().includes(s) || n.designation.toLowerCase().includes(s) || n.dept.toLowerCase().includes(s);
  const visible = (n: OrgNode): boolean => match(n) || (children.get(n.id) ?? []).some(visible);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const x = new Set(c);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  const render = (n: OrgNode): ReactNode => {
    if (!visible(n)) return null;
    const kids = (children.get(n.id) ?? []).filter(visible);
    const isOpen = (!collapsed.has(n.id) || !!s) && kids.length > 0;
    const hit = !!s && match(n);
    const quiet = n.quietDays ?? 0;
    const quietWarn = quiet >= idleAfter;
    const quietLabel = !n.linked ? "no login" : n.quietDays === undefined ? "" : n.quietDays === 0 ? "today" : `${n.quietDays}d quiet`;
    return (
      <li key={n.id}>
        <article className={cx("org-card", n.vacancy && "org-card-vacancy", hit && "org-card-hit", (n.overdue ?? 0) > 0 && "org-card-late")}>
          <Link href={`/team/${n.id}`} className="org-card-link">
            <Avatar name={n.name} size={36} vacancy={n.vacancy} />
            <div className="min-w-0 text-center">
              <div className={cx("truncate text-[13px] font-semibold leading-tight", n.vacancy && "text-ink-2")}>{n.name}</div>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">{n.designation}</p>
              {n.dotted ? <p className="mt-0.5 truncate text-[10.5px] text-ink-3">Dotted line to {n.dotted}</p> : null}
              {n.dept ? (
                <p className="mt-1 truncate text-[11px] font-medium text-ink-2" title={n.dept}>
                  {n.dept}
                </p>
              ) : null}
            </div>
            {n.vacancy ? (
              <span className="chip mt-1 h-5 w-fit self-center border border-dashed border-line-strong bg-white text-[10.5px]">New hire</span>
            ) : n.open !== undefined ? (
              <div className="org-card-stats">
                <span className="num text-ink-2" title="Open tasks">
                  {n.open} open
                </span>
                <span className="num" title="Overdue tasks" style={{ color: n.overdue ? "var(--color-phase-y)" : "var(--color-ink-3)" }}>
                  {n.overdue ? `${n.overdue} late` : "none late"}
                </span>
                {quietLabel ? (
                  <span className="num" title={n.quietDays !== undefined ? `${n.quietDays} working days since work was last logged` : undefined} style={{ color: !n.linked || quietWarn ? "var(--color-phase-y)" : "var(--color-ink-3)" }}>
                    {quietLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </Link>
          {kids.length > 0 && !s ? (
            <button
              type="button"
              className="org-card-toggle"
              aria-expanded={isOpen}
              aria-label={isOpen ? `Hide ${n.name}'s team` : `Show ${n.name}'s ${kids.length} ${kids.length === 1 ? "report" : "reports"}`}
              onClick={() => toggle(n.id)}
            >
              {isOpen ? <Minus size={12} strokeWidth={2.5} /> : `${kids.length}`}
              {!isOpen ? <ChevronDown size={12} /> : null}
            </button>
          ) : null}
        </article>
        {isOpen ? <ul>{kids.map((k) => render(k))}</ul> : null}
      </li>
    );
  };

  const roots = (children.get(null) ?? []).filter(visible);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" style={{ height: 34 }} placeholder="Find a person, role or department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCollapsed(new Set())}>
          Open all
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCollapsed(new Set(nodes.filter((n) => (children.get(n.id) ?? []).length && n.reportsTo).map((n) => n.id)))}>
          Heads only
        </button>
        <span className="text-[12.5px] text-ink-3">Scroll sideways to see the full tree. Lines show who reports to whom.</span>
      </div>
      <div className="org-chart">
        {roots.length ? <ul aria-label="Reporting tree">{roots.map((n) => render(n))}</ul> : <p className="px-4 py-8 text-center text-[13.5px] text-ink-3">No one matches that search.</p>}
      </div>
    </div>
  );
}
