"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Printer, Plus } from "lucide-react";
import { deleteMeeting, updateMeeting } from "@/lib/actions/meetings";
import { cx } from "../ui/bits";
import { ConfirmButton, PersonPicker, useAction, type PickPerson } from "../ui/client";

export function MeetingRecord({
  id,
  canEdit,
  notes,
  decisions,
  attendees,
  absentIds,
  people,
  canDelete,
}: {
  id: string;
  canEdit: boolean;
  notes: string;
  decisions: string;
  attendees: { id: string; name: string }[];
  absentIds: string[];
  people: PickPerson[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [n, setN] = useState(notes);
  const [d, setD] = useState(decisions);
  const [adding, setAdding] = useState(false);
  const { pending, run } = useAction();
  const absent = new Set(absentIds);
  const toggle = (pid: string) => {
    const next = new Set(absent);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    run(() => updateMeeting(id, { absentIds: [...next] }));
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Attendance</h2>
          <span className="num text-[12.5px] text-ink-3">
            {attendees.length - absentIds.length} of {attendees.length}
          </span>
        </div>
        <ul className="grid gap-0.5 p-2">
          {attendees.map((a) => (
            <li key={a.id}>
              <label className={cx("flex cursor-pointer items-center gap-2.5 rounded px-2 py-1 hover:bg-wash", absent.has(a.id) && "text-ink-3")}>
                <input type="checkbox" className="size-4 accent-[var(--color-earth-mark)]" checked={!absent.has(a.id)} disabled={!canEdit || pending} onChange={() => toggle(a.id)} />
                <span className={cx("flex-1 text-[13.5px]", absent.has(a.id) && "line-through")}>{a.name}</span>
                {absent.has(a.id) && <span className="text-[11.5px]">absent</span>}
              </label>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="border-t border-line p-2">
            {adding ? (
              <PersonPicker
                people={people.filter((p) => !attendees.some((a) => a.id === p.id))}
                value={null}
                autoFocus
                compact
                placeholder="Add someone"
                onChange={(pid) => {
                  setAdding(false);
                  if (pid) run(() => updateMeeting(id, { attendeeIds: [...attendees.map((a) => a.id), pid] }));
                }}
              />
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
                <Plus size={14} /> Add someone
              </button>
            )}
          </div>
        )}
      </section>
      <section className="panel p-3">
        <label className="field">
          <span className="label">Decisions</span>
          <textarea className="textarea" value={d} onChange={(e) => setD(e.target.value)} readOnly={!canEdit} placeholder="What was decided, in a line each" />
        </label>
        <label className="field mt-3">
          <span className="label">Notes</span>
          <textarea className="textarea" style={{ minHeight: 120 }} value={n} onChange={(e) => setN(e.target.value)} readOnly={!canEdit} placeholder="Anything worth keeping" />
        </label>
        {canEdit && (n !== notes || d !== decisions) && (
          <button className="btn btn-primary btn-sm mt-2" disabled={pending} onClick={() => run(() => updateMeeting(id, { notes: n, decisions: d }), { success: "Saved" })}>
            Save notes
          </button>
        )}
      </section>
      <div className="no-print flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => window.print()}>
          <Printer size={14} /> Print minutes
        </button>
        {canDelete && (
          <ConfirmButton className="btn btn-sm btn-ghost text-phase-r" confirm="The record of this meeting is deleted. Its actions stay as tasks." onConfirm={() => run(() => deleteMeeting(id), { success: "Deleted", onDone: () => router.push("/meetings") })}>
            Delete record
          </ConfirmButton>
        )}
      </div>
    </>
  );
}
