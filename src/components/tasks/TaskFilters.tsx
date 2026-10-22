"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { LayoutGrid, List, Download, SlidersHorizontal } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, SOURCES, SOURCE_LABEL } from "@/lib/domain/tasks";
import { cx } from "../ui/bits";
import { PersonPicker, type PickPerson } from "../ui/client";

export type View = { key: string; label: string; params: Record<string, string> };

export function TaskFilters({
  people,
  departments,
  projects,
  initiatives,
  views,
  manager,
}: {
  people: PickPerson[];
  departments: { id: string; name: string }[];
  projects: string[];
  initiatives: { id: string; name: string }[];
  views: View[];
  manager: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [more, setMore] = useState(() => ["owner", "dept", "priority", "project", "source", "initiative", "due"].some((k) => sp.get(k)));

  const urlQ = sp.get("q") ?? "";
  const [seenQ, setSeenQ] = useState(urlQ);
  if (seenQ !== urlQ) {
    setSeenQ(urlQ);
    setQ(urlQ);
  }

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("open");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  const view = sp.get("view") === "board" ? "board" : "list";
  const active = (v: View) => ["scope", "due", "status", "owner"].every((k) => (v.params[k] ?? "") === (sp.get(k) ?? ""));
  const exportHref = `/api/export/tasks?${(() => {
    const p = new URLSearchParams(sp.toString());
    p.delete("open");
    p.delete("view");
    return p.toString();
  })()}`;

  return (
    <div className="mb-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Saved views">
        {views.map((v) => (
          <Link
            key={v.key}
            href={`${pathname}?${new URLSearchParams({ ...v.params, ...(view === "board" ? { view: "board" } : {}) }).toString()}`}
            role="tab"
            aria-selected={active(v)}
            scroll={false}
            className={cx("chip h-7 px-3 text-[12.5px]", active(v) ? "bg-navy text-white" : "border border-line bg-white text-ink-2 hover:bg-wash")}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q });
          }}
        >
          <input className="input" style={{ height: 34 }} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== (sp.get("q") ?? "") && set({ q })} placeholder="Search titles, projects or T-number" aria-label="Search tasks" />
        </form>
        <select className="select" style={{ height: 34, width: 150 }} value={sp.get("status") ?? "open"} onChange={(e) => set({ status: e.target.value === "open" ? null : e.target.value })} aria-label="Status">
          <option value="open">Open</option>
          <option value="todo">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        {view === "list" && (
          <select className="select" style={{ height: 34, width: 168 }} value={sp.get("group") ?? "due"} onChange={(e) => set({ group: e.target.value === "due" ? null : e.target.value })} aria-label="Group by">
            <option value="due">Group by due date</option>
            <option value="owner">Group by person</option>
            <option value="dept">Group by department</option>
            <option value="project">Group by project</option>
            <option value="status">Group by status</option>
            <option value="none">No groups</option>
          </select>
        )}
        <button type="button" className={cx("btn", more && "bg-wash")} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <SlidersHorizontal size={15} /> Filters
        </button>
        <div className="flex overflow-hidden rounded-md border border-line-strong" role="group" aria-label="Layout">
          <button type="button" className={cx("flex h-[32px] items-center gap-1.5 px-2.5 text-[13px]", view === "list" ? "bg-brand-wash text-navy" : "bg-white text-ink-2")} onClick={() => set({ view: null })} aria-pressed={view === "list"}>
            <List size={15} /> List
          </button>
          <button type="button" className={cx("flex h-[32px] items-center gap-1.5 border-l border-line-strong px-2.5 text-[13px]", view === "board" ? "bg-brand-wash text-navy" : "bg-white text-ink-2")} onClick={() => set({ view: "board" })} aria-pressed={view === "board"}>
            <LayoutGrid size={15} /> Board
          </button>
        </div>
        <a href={exportHref} className="btn" title="Download these tasks as an Excel file">
          <Download size={15} /> Excel
        </a>
      </div>

      {more && (
        <div className="grid gap-3 rounded-lg border border-line bg-wash p-3 sm:grid-cols-2 lg:grid-cols-4">
          {manager && (
            <div className="field">
              <span className="label">Person</span>
              <PersonPicker people={people} value={sp.get("owner") || null} onChange={(id) => set({ owner: id })} allowEmpty emptyLabel="Anyone" placeholder="Anyone" compact />
            </div>
          )}
          {manager && (
            <label className="field">
              <span className="label">Department</span>
              <select className="select" style={{ height: 32 }} value={sp.get("dept") ?? ""} onChange={(e) => set({ dept: e.target.value })}>
                <option value="">Any</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="label">Due</span>
            <select className="select" style={{ height: 32 }} value={sp.get("due") ?? ""} onChange={(e) => set({ due: e.target.value })}>
              <option value="">Any time</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="next7">Next 7 days</option>
              <option value="month">This month</option>
              <option value="none">No due date</option>
              <option value="late_done">Finished late</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Priority</span>
            <select className="select" style={{ height: 32 }} value={sp.get("priority") ?? ""} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Any</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Project or site</span>
            <select className="select" style={{ height: 32 }} value={sp.get("project") ?? ""} onChange={(e) => set({ project: e.target.value })}>
              <option value="">Any</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Came from</span>
            <select className="select" style={{ height: 32 }} value={sp.get("source") ?? ""} onChange={(e) => set({ source: e.target.value })}>
              <option value="">Anywhere</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Initiative</span>
            <select className="select" style={{ height: 32 }} value={sp.get("initiative") ?? ""} onChange={(e) => set({ initiative: e.target.value })}>
              <option value="">Any</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" className="btn btn-ghost" onClick={() => router.replace(pathname, { scroll: false })}>
              Clear all filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
