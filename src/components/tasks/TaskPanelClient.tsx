"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X, Link2, Repeat, Trash2, Eye, EyeOff, Plus } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, SOURCES, SOURCE_LABEL, STATUS_LABEL, isOpen } from "@/lib/domain/tasks";
import { formatDate, formatDateTime, isoDate, timeAgo } from "@/lib/domain/dates";
import { addCheck, addComment, deleteTask, removeCheck, setWatching, stopSeries, toggleCheck, updateTask, type TaskPatch } from "@/lib/actions/tasks";
import { Avatar, cx, StatusPill } from "../ui/bits";
import { ConfirmButton, PersonPicker, toast, useAction, type PickPerson } from "../ui/client";

export type PanelData = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  blockedReason: string;
  priority: string;
  ownerId: string;
  ownerName: string;
  creatorName: string;
  createdAt: string;
  dueDate: string | null;
  originalDue: string | null;
  slips: number;
  completedAt: string | null;
  project: string;
  source: string;
  initiativeId: string | null;
  milestoneId: string | null;
  kraId: string | null;
  meeting: { id: string; title: string; heldOn: string } | null;
  series: { id: string; text: string; active: boolean } | null;
  deptName: string;
  checks: { id: string; text: string; done: boolean }[];
  updates: { id: string; kind: string; body: string; authorName: string; at: string }[];
  watchers: { id: string; name: string }[];
  can: { edit: boolean; update: boolean; delete: boolean };
  me: string | null;
  isOwner: boolean;
  requireSlipReason: boolean;
};

const STATUS_BUTTONS = ["todo", "in_progress", "blocked", "done"] as const;

export function TaskPanelClient({
  data,
  people,
  initiatives,
  milestones,
  kras,
  today,
  closeHref,
}: {
  data: PanelData;
  people: PickPerson[];
  initiatives: { id: string; name: string }[];
  milestones: { id: string; name: string }[];
  kras: { id: string; title: string }[];
  today: string;
  closeHref: string;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [title, setTitle] = useState(data.title);
  const [desc, setDesc] = useState(data.description);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState(data.blockedReason);
  const [due, setDue] = useState(data.dueDate ?? "");
  const [slipReason, setSlipReason] = useState("");
  const [comment, setComment] = useState("");
  const [newCheck, setNewCheck] = useState("");
  const [addingWatcher, setAddingWatcher] = useState(false);

  // Escape closes the panel, unless a dialog on top of it is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  const save = (patch: TaskPatch, success?: string, reason?: string) => run(() => updateTask(data.id, patch, reason), { success });
  const dueLater = !!data.dueDate && (!due || due > data.dueDate);
  const needsReason = due !== (data.dueDate ?? "") && dueLater && isOpen(data.status) && !data.can.edit && data.requireSlipReason;
  const watching = !!data.me && data.watchers.some((w) => w.id === data.me);
  const ro = !data.can.update;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="num text-[13px] font-semibold whitespace-nowrap text-ink-2">T-{data.number}</span>
        {data.deptName && <span className="chip hidden sm:inline-flex">{data.deptName}</span>}
        <StatusPill status={data.status} small />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/tasks?open=${data.number}`);
              toast("Link copied");
            }}
          >
            <Link2 size={14} /> Copy link
          </button>
          <Link href={closeHref} scroll={false} className="btn btn-ghost btn-sm btn-icon" aria-label="Close">
            <X size={16} />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Title */}
        {ro ? (
          <h2 className="text-[19px] leading-snug font-semibold">{data.title}</h2>
        ) : (
          <textarea
            aria-label="Title"
            className="w-full resize-none rounded-md border border-transparent px-1 py-0.5 text-[19px] leading-snug font-semibold hover:border-line focus:border-brand focus:outline-none"
            rows={Math.min(4, Math.max(1, Math.ceil(title.length / 48)))}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== data.title && save({ title }, "Title saved")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        )}

        {/* Status */}
        {!ro && data.status !== "cancelled" && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {STATUS_BUTTONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                aria-pressed={data.status === s}
                onClick={() => {
                  if (s === "blocked") setBlockOpen(true);
                  else save({ status: s }, `Marked ${STATUS_LABEL[s].toLowerCase()}`);
                }}
                className={cx(
                  "btn btn-sm",
                  data.status === s && s === "done" && "border-earth-mark bg-earth-wash text-earth",
                  data.status === s && s === "blocked" && "border-phase-r bg-phase-r-wash text-phase-r",
                  data.status === s && s === "in_progress" && "border-brand bg-brand-wash text-navy",
                  data.status === s && s === "todo" && "border-ink-3 bg-wash-2",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            {data.can.edit && (
              <button type="button" className="btn btn-sm btn-ghost text-ink-3" onClick={() => save({ status: "cancelled" }, "Cancelled")}>
                Cancel task
              </button>
            )}
          </div>
        )}
        {data.status === "cancelled" && data.can.edit && (
          <button type="button" className="btn btn-sm mt-3" onClick={() => save({ status: "todo" }, "Reopened")}>
            Reopen
          </button>
        )}
        {data.completedAt && <p className="mt-2 text-[12.5px] text-earth">Done {formatDateTime(data.completedAt)}{data.dueDate ? (isoDate(new Date(data.completedAt)) <= data.dueDate ? ", on time" : `, after the due date (${formatDate(data.dueDate, today)})`) : ""}</p>}

        {(blockOpen || data.status === "blocked") && (
          <div className="mt-3 rounded-md border border-[#efc3bc] bg-phase-r-wash p-3">
            <label className="field">
              <span className="label text-phase-r">What is blocking it?</span>
              <textarea className="textarea" style={{ minHeight: 60 }} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} disabled={ro} placeholder="e.g. Waiting for client's approved drawings" />
            </label>
            {!ro && (
              <div className="mt-2 flex gap-2">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={!blockReason.trim() || pending || (data.status === "blocked" && blockReason === data.blockedReason)}
                  onClick={() => {
                    save({ status: "blocked", blockedReason: blockReason }, data.status === "blocked" ? "Saved" : "Marked blocked; their manager has been told");
                    setBlockOpen(false);
                  }}
                >
                  {data.status === "blocked" ? "Save" : "Mark blocked"}
                </button>
                {data.status !== "blocked" && (
                  <button className="btn btn-sm" onClick={() => setBlockOpen(false)}>
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Details */}
        <dl className="mt-5 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 text-[13.5px]">
          <dt className="text-ink-3">Owner</dt>
          <dd>
            {data.can.edit ? (
              <PersonPicker people={people} value={data.ownerId} onChange={(id) => id && id !== data.ownerId && save({ ownerId: id }, "Handed over")} label="Owner" compact />
            ) : (
              <span className="flex items-center gap-2">
                <Avatar name={data.ownerName} size={22} /> {data.ownerName}
              </span>
            )}
          </dd>

          <dt className="text-ink-3">Due</dt>
          <dd>
            {ro ? (
              <span>{data.dueDate ? formatDate(data.dueDate, today) : "No date"}</span>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="input"
                    style={{ height: 30, width: 160 }}
                    value={due}
                    onChange={(e) => {
                      setDue(e.target.value);
                      const later = !!data.dueDate && (!e.target.value || e.target.value > data.dueDate);
                      if (!(later && isOpen(data.status) && !data.can.edit && data.requireSlipReason)) save({ dueDate: e.target.value || null }, "Due date saved");
                    }}
                  />
                  {data.slips > 0 && (
                    <span className="text-[12px] text-phase-y" title={data.originalDue ? `First due ${formatDate(data.originalDue, today)}` : undefined}>
                      moved later {data.slips}×{data.originalDue ? `, first due ${formatDate(data.originalDue, today)}` : ""}
                    </span>
                  )}
                </div>
                {needsReason && (
                  <div className="grid gap-2 rounded-md border border-[#f0d48f] bg-phase-y-wash p-2.5">
                    <label className="field">
                      <span className="label">Why is the date moving?</span>
                      <input className="input" style={{ height: 32 }} value={slipReason} onChange={(e) => setSlipReason(e.target.value)} placeholder="Shared with whoever gave you the task" autoFocus />
                    </label>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-primary" disabled={!slipReason.trim() || pending} onClick={() => save({ dueDate: due || null }, "Date moved", slipReason)}>
                        Move the date
                      </button>
                      <button className="btn btn-sm" onClick={() => setDue(data.dueDate ?? "")}>
                        Keep {data.dueDate ? formatDate(data.dueDate, today) : "it"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </dd>

          <dt className="text-ink-3">Priority</dt>
          <dd>
            {data.can.edit ? (
              <select className="select" style={{ height: 30, width: 160 }} value={data.priority} onChange={(e) => save({ priority: e.target.value }, "Priority saved")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            ) : (
              PRIORITY_LABEL[data.priority as keyof typeof PRIORITY_LABEL]
            )}
          </dd>

          <dt className="text-ink-3">Project or site</dt>
          <dd>
            {data.can.edit ? (
              <input className="input" style={{ height: 30 }} defaultValue={data.project} placeholder="None" onBlur={(e) => e.target.value.trim() !== data.project && save({ project: e.target.value }, "Project saved")} />
            ) : (
              data.project || <span className="text-ink-3">None</span>
            )}
          </dd>

          <dt className="text-ink-3">Came from</dt>
          <dd>
            {data.can.edit ? (
              <select className="select" style={{ height: 30 }} value={data.source} onChange={(e) => save({ source: e.target.value }, "Saved")}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              SOURCE_LABEL[data.source as keyof typeof SOURCE_LABEL] ?? data.source
            )}
            {data.meeting && (
              <Link href={`/meetings/${data.meeting.id}`} className="link ml-2 text-[12.5px]">
                {data.meeting.title}, {formatDate(data.meeting.heldOn, today)}
              </Link>
            )}
          </dd>

          <dt className="text-ink-3">Initiative</dt>
          <dd className="grid gap-2">
            {data.can.edit ? (
              <>
                <select className="select" style={{ height: 30 }} value={data.initiativeId ?? ""} onChange={(e) => save({ initiativeId: e.target.value || null, milestoneId: null }, "Saved")}>
                  <option value="">None</option>
                  {initiatives.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                {data.initiativeId && milestones.length > 0 && (
                  <select className="select" style={{ height: 30 }} value={data.milestoneId ?? ""} onChange={(e) => save({ milestoneId: e.target.value || null }, "Saved")} aria-label="Milestone">
                    <option value="">No milestone</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : data.initiativeId ? (
              <Link href={`/initiatives/${data.initiativeId}`} className="link">
                {initiatives.find((i) => i.id === data.initiativeId)?.name ?? "Open"}
              </Link>
            ) : (
              <span className="text-ink-3">None</span>
            )}
          </dd>

          {(kras.length > 0 || data.kraId) && (
            <>
              <dt className="text-ink-3">Counts toward</dt>
              <dd>
                {data.can.edit ? (
                  <select className="select" style={{ height: 30 }} value={data.kraId ?? ""} onChange={(e) => save({ kraId: e.target.value || null }, "Saved")}>
                    <option value="">No KRA</option>
                    {kras.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  kras.find((k) => k.id === data.kraId)?.title ?? <span className="text-ink-3">No KRA</span>
                )}
              </dd>
            </>
          )}

          {data.series && (
            <>
              <dt className="text-ink-3">Repeats</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <Repeat size={14} className="text-ink-3" />
                <span className={cx(!data.series.active && "text-ink-3 line-through")}>{data.series.text}</span>
                {data.series.active && (data.can.edit || data.isOwner) && (
                  <ConfirmButton className="btn btn-sm btn-ghost" confirm="No new tasks will be made from this repeat. Tasks already made stay as they are." onConfirm={() => run(() => stopSeries(data.series!.id), { success: "Repeat stopped" })}>
                    Stop repeating
                  </ConfirmButton>
                )}
              </dd>
            </>
          )}

          <dt className="text-ink-3">Created</dt>
          <dd className="text-ink-2">
            {formatDateTime(data.createdAt)}
            {data.creatorName ? ` by ${data.creatorName}` : ""}
          </dd>
        </dl>

        {/* Notes */}
        <section className="mt-6">
          <h3 className="section-title mb-1.5">Notes</h3>
          {ro ? (
            <p className="text-[14px] whitespace-pre-wrap text-ink-2">{data.description || "No notes."}</p>
          ) : (
            <>
              <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What done looks like, documents, who to call" />
              {desc !== data.description && (
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => save({ description: desc }, "Notes saved")}>
                    Save notes
                  </button>
                  <button className="btn btn-sm" onClick={() => setDesc(data.description)}>
                    Undo
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Steps */}
        <section className="mt-6">
          <h3 className="section-title mb-1.5">
            Steps {data.checks.length > 0 && <span className="num font-normal text-ink-3">{data.checks.filter((c) => c.done).length}/{data.checks.length}</span>}
          </h3>
          <ul className="grid gap-1">
            {data.checks.map((c) => (
              <li key={c.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-wash">
                <input type="checkbox" className="size-4 accent-[var(--color-earth-mark)]" checked={c.done} disabled={ro || pending} onChange={(e) => run(() => toggleCheck(c.id, e.target.checked))} aria-label={c.text} />
                <span className={cx("flex-1 text-[14px]", c.done && "text-ink-3 line-through")}>{c.text}</span>
                {!ro && (
                  <button className="btn btn-ghost btn-sm btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => run(() => removeCheck(c.id))} aria-label={`Remove step ${c.text}`}>
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!ro && (
            <form
              className="mt-1.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCheck.trim()) return;
                run(() => addCheck(data.id, newCheck), { onDone: () => setNewCheck("") });
              }}
            >
              <input className="input" style={{ height: 32 }} value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add a step" aria-label="New step" />
              <button className="btn btn-sm" style={{ height: 32 }} disabled={!newCheck.trim() || pending}>
                <Plus size={14} /> Add
              </button>
            </form>
          )}
        </section>

        {/* Watchers */}
        <section className="mt-6">
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="section-title">Watching</h3>
            {data.me && !data.isOwner && (
              <button className="btn btn-ghost btn-sm" onClick={() => run(() => setWatching(data.id, data.me!, !watching), { success: watching ? "Stopped watching" : "You'll hear about changes" })}>
                {watching ? <EyeOff size={14} /> : <Eye size={14} />} {watching ? "Stop watching" : "Watch"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.watchers.length === 0 && <span className="text-[13px] text-ink-3">Only the owner and the person who gave it hear about changes.</span>}
            {data.watchers.map((w) => (
              <span key={w.id} className="chip" style={{ paddingLeft: 3 }}>
                <Avatar name={w.name} size={18} /> {w.name}
                {data.can.update && (
                  <button className="ml-0.5 text-ink-3 hover:text-ink" onClick={() => run(() => setWatching(data.id, w.id, false))} aria-label={`Remove ${w.name}`}>
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {data.can.update &&
              (addingWatcher ? (
                <div className="w-64">
                  <PersonPicker
                    people={people.filter((p) => p.id !== data.ownerId && !data.watchers.some((w) => w.id === p.id))}
                    value={null}
                    autoFocus
                    compact
                    placeholder="Add someone"
                    onChange={(id) => {
                      setAddingWatcher(false);
                      if (id) run(() => setWatching(data.id, id, true), { success: "Added" });
                    }}
                  />
                </div>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setAddingWatcher(true)}>
                  <Plus size={14} /> Add someone
                </button>
              ))}
          </div>
        </section>

        {/* Updates */}
        <section className="mt-6">
          <h3 className="section-title mb-2">Updates</h3>
          {data.me && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                run(() => addComment(data.id, comment), { onDone: () => setComment(""), success: "Update posted" });
              }}
              className="mb-4"
            >
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Post progress, a question or what you need. @name tells someone."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement).requestSubmit();
                  }
                }}
                aria-label="New update"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] text-ink-3">Ctrl + Enter to post</span>
                <button className="btn btn-sm btn-primary" disabled={!comment.trim() || pending}>
                  Post update
                </button>
              </div>
            </form>
          )}
          <ol className="grid gap-3">
            {[...data.updates].reverse().map((u) =>
              u.kind === "comment" ? (
                <li key={u.id} className="flex gap-2.5">
                  <Avatar name={u.authorName || "?"} size={26} />
                  <div className="min-w-0 flex-1 rounded-md border border-line bg-wash px-3 py-2">
                    <div className="text-[12.5px]">
                      <span className="font-semibold">{u.authorName}</span> <span className="text-ink-3">{timeAgo(u.at)}</span>
                    </div>
                    <p className="mt-0.5 text-[14px] whitespace-pre-wrap">{u.body}</p>
                  </div>
                </li>
              ) : (
                <li key={u.id} className="flex items-baseline gap-2 pl-1 text-[12.5px] text-ink-3">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-line-strong" />
                  <span>
                    <span className="text-ink-2">{u.authorName}</span> {u.body.charAt(0).toLowerCase() + u.body.slice(1)} <span className="whitespace-nowrap">{timeAgo(u.at)}</span>
                  </span>
                </li>
              ),
            )}
          </ol>
        </section>
      </div>

      {data.can.delete && (
        <div className="flex justify-end border-t border-line px-4 py-2.5">
          <ConfirmButton
            className="btn btn-sm btn-ghost text-phase-r"
            confirm={`T-${data.number} and its updates will be deleted for everyone. Cancelling keeps the record; deleting doesn't.`}
            onConfirm={() =>
              run(() => deleteTask(data.id), {
                success: `Deleted T-${data.number}`,
                onDone: () => router.push(closeHref, { scroll: false }),
              })
            }
          >
            <Trash2 size={14} /> Delete task
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
