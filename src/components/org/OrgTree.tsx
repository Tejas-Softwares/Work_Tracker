"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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

  const render = (n: OrgNode, depth: number) => {
    if (!visible(n)) return null;
    const kids = children.get(n.id) ?? [];
    const isOpen = !collapsed.has(n.id) || !!s;
    return (
      <li key={n.id}>
        <div className="group flex items-center gap-2 border-b border-line py-1.5 pr-3 hover:bg-[#fafbfd]" style={{ paddingLeft: 8 + depth * 22 }}>
          {kids.length ? (
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-ink-3 hover:bg-wash"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Hide" : "Show"} ${n.name}'s team`}
              onClick={() =>
                setCollapsed((c) => {
                  const x = new Set(c);
                  if (x.has(n.id)) x.delete(n.id);
                  else x.add(n.id);
                  return x;
                })
              }
            >
              <ChevronRight size={15} className={cx("transition-transform", isOpen && "rotate-90")} />
            </button>
          ) : (
            <span className="size-6" />
          )}
          <Avatar name={n.name} size={28} vacancy={n.vacancy} />
          <Link href={`/team/${n.id}`} className="min-w-0 flex-1">
            <span className={cx("block truncate text-[14px] font-semibold", n.vacancy && "font-[550] text-ink-2")}>
              {n.vacancy ? `${n.name}` : n.name}
              {n.vacancy && <span className="ml-2 chip h-5 border border-dashed border-line-strong bg-white text-[11px]">New hire</span>}
            </span>
            <span className="block truncate text-[12.5px] text-ink-3">
              {n.designation}
              {n.dotted ? `, dotted line to ${n.dotted}` : ""}
            </span>
          </Link>
          <span className="hidden w-[150px] truncate text-[12.5px] text-ink-2 md:block">{n.dept}</span>
          {n.open !== undefined && !n.vacancy ? (
            <span className="hidden w-[210px] items-center justify-end gap-3 text-[12.5px] sm:flex">
              <span className="num text-ink-2" title="Open tasks">
                {n.open} open
              </span>
              <span className="num w-[70px] text-right" style={{ color: n.overdue ? "var(--color-phase-y)" : "var(--color-ink-3)" }} title="Overdue tasks">
                {n.overdue ? `${n.overdue} late` : "none late"}
              </span>
              <span
                className="num w-[48px] text-right"
                title={n.quietDays !== undefined ? `${n.quietDays} working days since work was last logged` : undefined}
                style={{ color: (n.quietDays ?? 0) >= idleAfter ? "var(--color-phase-y)" : "var(--color-ink-3)" }}
              >
                {!n.linked ? "no login" : n.quietDays === undefined ? "" : n.quietDays === 0 ? "today" : `${n.quietDays}d quiet`}
              </span>
            </span>
          ) : (
            <span className="hidden w-[210px] sm:block" />
          )}
        </div>
        {kids.length > 0 && isOpen && <ul>{kids.map((k) => render(k, depth + 1))}</ul>}
      </li>
    );
  };

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
      </div>
      <ul className="overflow-hidden rounded-lg border border-line [&>li:last-child>div]:border-b-0">{(children.get(null) ?? []).map((n) => render(n, 0))}</ul>
    </div>
  );
}
