"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { STATUS_LABEL } from "@/lib/domain/tasks";
import { updateTask } from "@/lib/actions/tasks";
import { Avatar, cx, DueText, PriorityMark, statusColor } from "../ui/bits";
import { Dialog, useAction } from "../ui/client";
import type { TaskItem } from "./types";

const COLUMNS = ["todo", "in_progress", "blocked", "done"] as const;

export function TaskBoard({ items, today }: { items: TaskItem[]; today: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<TaskItem | null>(null);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();

  const href = (n: number) => {
    const p = new URLSearchParams(sp.toString());
    p.set("open", String(n));
    return `${pathname}?${p.toString()}`;
  };

  function move(t: TaskItem, status: string) {
    if (t.status === status) return;
    if (status === "blocked") {
      setBlocking(t);
      setReason("");
      return;
    }
    run(() => updateTask(t.id, { status }), { success: `T-${t.number} moved to ${STATUS_LABEL[status as keyof typeof STATUS_LABEL].toLowerCase()}` });
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(4,minmax(250px,1fr))] gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = items.filter((t) => t.status === col);
          return (
            <section
              key={col}
              aria-label={STATUS_LABEL[col]}
              className={cx("flex min-h-[200px] min-w-0 flex-col rounded-lg border bg-wash p-2 transition-colors", over === col ? "border-brand bg-brand-wash" : "border-line")}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const t = items.find((x) => x.id === dragId);
                if (t) move(t, col);
                setDragId(null);
              }}
            >
              <h3 className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-[13px] font-semibold">
                <span className="size-2 rounded-full" style={{ background: statusColor(col) }} />
                {col === "done" ? "Done this week" : STATUS_LABEL[col]}
                <span className="num font-normal text-ink-3">{list.length}</span>
              </h3>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {list.map((t) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cx("min-w-0 rounded-md border border-line bg-white p-2.5 shadow-[0_1px_0_rgb(26_34_56/0.04)]", dragId === t.id && "opacity-50", pending && "cursor-wait")}
                  >
                    <Link href={href(t.number)} scroll={false} className="block text-[13.5px] leading-snug font-[550] hover:text-brand">
                      {t.title}
                    </Link>
                    {t.status === "blocked" && t.blockedReason && <p className="mt-1 text-[12px] text-phase-r">{t.blockedReason}</p>}
                    <div className="mt-2 flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
                      <span title={t.ownerName} className="shrink-0">
                        <Avatar name={t.ownerName} size={20} vacancy={t.ownerVacancy} />
                      </span>
                      <span className="num shrink-0 whitespace-nowrap">T-{t.number}</span>
                      <span className="min-w-0 flex-1 truncate">{t.project}</span>
                      <PriorityMark priority={t.priority} />
                      <span className="shrink-0 whitespace-nowrap">
                        <DueText due={t.dueDate} status={t.status} today={today} />
                      </span>
                    </div>
                    {/* Moving without drag and drop (phones, keyboards) */}
                    <label className="sr-only" htmlFor={`mv-${t.id}`}>
                      Move T-{t.number}
                    </label>
                    <select
                      id={`mv-${t.id}`}
                      className="mt-2 h-7 w-full rounded border border-line bg-white px-1.5 text-[12px] text-ink-2 md:hidden"
                      value={t.status}
                      onChange={(e) => move(t, e.target.value)}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c} value={c}>
                          {STATUS_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <Dialog
        open={!!blocking}
        onClose={() => setBlocking(null)}
        title={`What is blocking T-${blocking?.number ?? ""}?`}
        width={460}
        footer={
          <>
            <button className="btn" onClick={() => setBlocking(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!reason.trim() || pending}
              onClick={() => {
                const t = blocking!;
                setBlocking(null);
                run(() => updateTask(t.id, { status: "blocked", blockedReason: reason }), { success: `T-${t.number} marked blocked; their manager has been told` });
              }}
            >
              Mark blocked
            </button>
          </>
        }
      >
        <p className="mb-3 text-[13.5px] text-ink-2">The person who gave the task and the owner&apos;s manager are told, so someone can clear it.</p>
        <textarea className="textarea" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for client's approved drawings" />
      </Dialog>
    </>
  );
}
