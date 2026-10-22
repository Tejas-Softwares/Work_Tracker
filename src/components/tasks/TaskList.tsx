"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, MessageSquare, Repeat, ListChecks as ChecksIcon } from "lucide-react";
import { BUCKET_LABEL, dueBucket, isOpen, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, type DueBucket } from "@/lib/domain/tasks";
import { bulkUpdate, updateTask } from "@/lib/actions/tasks";
import { Avatar, cx, DueText, PriorityMark, StatusPill, statusColor } from "../ui/bits";
import { PersonPicker, toast, useAction, type PickPerson } from "../ui/client";
import type { TaskItem } from "./types";

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none", "closed"];

type Group = { key: string; label: string; tone?: "warn"; items: TaskItem[] };

function groupTasks(items: TaskItem[], by: string, today: string): Group[] {
  if (by === "none") return [{ key: "all", label: "", items }];
  const map = new Map<string, Group>();
  for (const t of items) {
    let key: string, label: string;
    if (by === "owner") [key, label] = [t.ownerId, t.ownerName];
    else if (by === "dept") [key, label] = [t.deptId ?? "", t.deptName || "No department"];
    else if (by === "project") [key, label] = [t.project, t.project || "No project"];
    else if (by === "status") [key, label] = [t.status, STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status];
    else {
      const b = dueBucket(t, today);
      [key, label] = [b, BUCKET_LABEL[b]];
    }
    if (!map.has(key)) map.set(key, { key, label, items: [], tone: key === "overdue" ? "warn" : undefined });
    map.get(key)!.items.push(t);
  }
  const groups = [...map.values()];
  if (by === "due") groups.sort((a, b) => BUCKET_ORDER.indexOf(a.key as DueBucket) - BUCKET_ORDER.indexOf(b.key as DueBucket));
  else if (by === "status") {
    const order = ["blocked", "in_progress", "todo", "done", "cancelled"];
    groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else groups.sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.label.localeCompare(b.label)));
  return groups;
}

export function TaskList({
  items,
  today,
  group = "due",
  people,
  showOwner = true,
  selectable = true,
  emptyText = "Nothing here.",
  compact = false,
}: {
  items: TaskItem[];
  today: string;
  group?: string;
  people: PickPerson[];
  showOwner?: boolean;
  selectable?: boolean;
  emptyText?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupTasks(items, group, today), [items, group, today]);
  const { pending, run } = useAction();

  const openHref = (n: number) => {
    const p = new URLSearchParams(sp.toString());
    p.set("open", String(n));
    return `${pathname}?${p.toString()}`;
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!items.length) return <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-ink-2">{emptyText}</p>;

  return (
    <div className="relative">
      {groups.map((g) => (
        <section key={g.key} className="mb-5 last:mb-0">
          {g.label && (
            <h3 className="mb-1.5 flex items-center gap-2 px-1 text-[12.5px] font-semibold" style={{ color: g.tone === "warn" ? "var(--color-phase-y)" : "var(--color-ink-2)" }}>
              {g.label}
              <span className="num font-normal text-ink-3">{g.items.length}</span>
            </h3>
          )}
          <ul className="overflow-hidden rounded-lg border border-line">
            {g.items.map((t) => (
              <li key={t.id} className={cx("group flex items-center gap-3 border-b border-line bg-white px-3 last:border-b-0 hover:bg-[#fafbfd]", compact ? "py-1.5" : "py-2")}>
                {selectable && (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-brand opacity-40 group-hover:opacity-100 checked:opacity-100"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label={`Select T-${t.number}`}
                  />
                )}
                <DoneToggle task={t} />
                <Link href={openHref(t.number)} scroll={false} className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={cx("text-[14px] font-[550]", !isOpen(t.status) && "text-ink-3 line-through decoration-line-strong")}>{t.title}</span>
                    {t.status === "blocked" && <StatusPill status="blocked" small />}
                    {t.status === "in_progress" && <span className="size-1.5 rounded-full" style={{ background: statusColor("in_progress") }} title="In progress" />}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                    <span className="num">T-{t.number}</span>
                    {t.project && <span className="text-ink-2">{t.project}</span>}
                    {t.status === "blocked" && t.blockedReason && <span className="truncate text-phase-r">{t.blockedReason}</span>}
                    {t.checksTotal > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ChecksIcon size={12} /> {t.checksDone}/{t.checksTotal}
                      </span>
                    )}
                    {t.updates > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare size={12} /> {t.updates}
                      </span>
                    )}
                    {t.repeating && (
                      <span className="inline-flex items-center gap-1" title="Repeats">
                        <Repeat size={12} />
                      </span>
                    )}
                    {t.slips > 0 && <span title="Times the due date was moved later">moved {t.slips}×</span>}
                  </span>
                </Link>
                <span className="hidden sm:inline">
                  <PriorityMark priority={t.priority} />
                </span>
                {showOwner && (
                  <span className="hidden w-[150px] items-center gap-2 truncate md:flex" title={t.ownerName}>
                    <Avatar name={t.ownerName} size={22} vacancy={t.ownerVacancy} />
                    <span className="truncate text-[13px] text-ink-2">{t.ownerName}</span>
                  </span>
                )}
                <span className="w-[86px] shrink-0 text-right text-[13px]">
                  <DueText due={t.dueDate} status={t.status} today={today} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {selectable && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          people={people}
          pending={pending}
          onClear={() => setSelected(new Set())}
          onApply={(change, label) =>
            run(() => bulkUpdate([...selected], change), {
              onDone: (r) => {
                const d = r.data as { changed: number; skipped: number };
                toast(`${label}: ${d.changed} changed${d.skipped ? `, ${d.skipped} not yours to change` : ""}`);
                setSelected(new Set());
                router.refresh();
              },
            })
          }
        />
      )}
    </div>
  );
}

function DoneToggle({ task }: { task: TaskItem }) {
  const { pending, run } = useAction();
  const done = task.status === "done";
  const disabled = task.status === "cancelled";
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() => run(() => updateTask(task.id, { status: done ? "todo" : "done" }), { success: done ? `Reopened T-${task.number}` : `Done: T-${task.number}` })}
      className={cx(
        "flex size-[20px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        done ? "border-earth-mark bg-earth-mark text-white" : "border-line-strong text-transparent hover:border-earth-mark hover:text-earth-mark",
        pending && "opacity-50",
      )}
      aria-label={done ? `Reopen T-${task.number}` : `Mark T-${task.number} done`}
      title={done ? "Reopen" : "Mark done"}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}

function BulkBar({
  count,
  people,
  pending,
  onClear,
  onApply,
}: {
  count: number;
  people: PickPerson[];
  pending: boolean;
  onClear: () => void;
  onApply: (change: { status?: "done" | "cancelled"; ownerId?: string; dueDate?: string; priority?: string }, label: string) => void;
}) {
  const [mode, setMode] = useState<"" | "owner" | "due" | "priority">("");
  const [due, setDue] = useState("");
  return (
    <div className="anim-pop sticky bottom-20 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2 shadow-[var(--shadow-pop)] md:bottom-4">
      <span className="px-2 text-[13px] font-semibold">{count} selected</span>
      <button className="btn btn-sm" disabled={pending} onClick={() => onApply({ status: "done" }, "Marked done")}>
        Mark done
      </button>
      <button className="btn btn-sm" onClick={() => setMode(mode === "owner" ? "" : "owner")}>
        Hand to…
      </button>
      <button className="btn btn-sm" onClick={() => setMode(mode === "due" ? "" : "due")}>
        Move date…
      </button>
      <button className="btn btn-sm" onClick={() => setMode(mode === "priority" ? "" : "priority")}>
        Priority…
      </button>
      <button className="btn btn-sm btn-ghost ml-auto" onClick={onClear}>
        Clear
      </button>
      {mode === "owner" && (
        <div className="w-full sm:w-72">
          <PersonPicker people={people} value={null} onChange={(id) => id && onApply({ ownerId: id }, "Handed over")} placeholder="Hand to…" autoFocus compact />
        </div>
      )}
      {mode === "due" && (
        <div className="flex w-full items-center gap-2">
          <input type="date" className="input" style={{ height: 30, width: 170 }} value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="btn btn-sm btn-primary" disabled={!due || pending} onClick={() => onApply({ dueDate: due }, "Dates moved")}>
            Apply
          </button>
        </div>
      )}
      {mode === "priority" && (
        <div className="flex w-full flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button key={p} className="btn btn-sm" disabled={pending} onClick={() => onApply({ priority: p }, `Priority ${PRIORITY_LABEL[p].toLowerCase()}`)}>
              <PriorityMark priority={p} /> {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
