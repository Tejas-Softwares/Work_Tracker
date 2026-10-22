"use client";

import { useState } from "react";
import { Check, X, RotateCcw, Pencil, Plus, Trash2 } from "lucide-react";
import { saveMilestone, setMilestoneStatus, deleteMilestone } from "@/lib/actions/initiatives";
import { formatDate } from "@/lib/domain/dates";
import { cx } from "../ui/bits";
import { Dialog, ConfirmButton, useAction } from "../ui/client";
import { openQuickAdd } from "../tasks/QuickAdd";

type M = { id: string; name: string; dueDate: string | null; criteria: string; status: string; tasks: number; done: number; late: number };

export function Milestones({ initiativeId, initiativeName, milestones, canEdit, today }: { initiativeId: string; initiativeName: string; milestones: M[]; canEdit: boolean; today: string }) {
  const [edit, setEdit] = useState<Partial<M> | null>(null);
  const { pending, run } = useAction();
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title">Gates</h2>
        {canEdit && (
          <button className="btn btn-sm" onClick={() => setEdit({ name: "", dueDate: "", criteria: "" })}>
            <Plus size={14} /> Add gate
          </button>
        )}
      </div>
      <ol className="grid gap-2">
        {milestones.map((m) => (
          <li key={m.id} className={cx("rounded-lg border p-3", m.status === "met" ? "border-[#b9dcc6] bg-earth-wash/40" : m.status === "missed" ? "border-[#efc3bc]" : m.dueDate && m.dueDate < today ? "border-[#f0d48f]" : "border-line")}>
            <div className="grid gap-2">
              <div className="min-w-0">
                <div className="font-semibold">
                  {m.name}
                  <span className="ml-2 text-[12.5px] font-normal text-ink-3">
                    {m.dueDate ? formatDate(m.dueDate, today) : "no date"}
                    {m.status === "met" ? ", met" : m.status === "missed" ? ", missed" : m.dueDate && m.dueDate < today ? ", past due" : ""}
                  </span>
                </div>
                {m.criteria && <p className="mt-0.5 text-[13px] text-ink-2">Done when: {m.criteria}</p>}
                <p className="mt-1 text-[12.5px] text-ink-3">
                  {m.done} of {m.tasks} tasks done{m.late ? <span className="text-phase-y">, {m.late} late</span> : ""}
                </p>
              </div>
              <div className="-ml-1 flex flex-wrap items-center gap-1">
                <button className="btn btn-sm btn-ghost" onClick={() => openQuickAdd({ initiativeId, milestoneId: m.id, context: `${initiativeName}, ${m.name}` })}>
                  <Plus size={14} /> Task
                </button>
                {canEdit && (
                  <>
                    {m.status === "pending" ? (
                      <>
                        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setMilestoneStatus(m.id, "met"), { success: "Marked met" })}>
                          <Check size={14} /> Met
                        </button>
                        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => setMilestoneStatus(m.id, "missed"), { success: "Marked missed" })}>
                          <X size={14} /> Missed
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => setMilestoneStatus(m.id, "pending"))}>
                        <RotateCcw size={14} /> Reopen
                      </button>
                    )}
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`}>
                      <Pencil size={14} />
                    </button>
                    <ConfirmButton className="btn btn-sm btn-ghost btn-icon" confirm={`Remove the gate “${m.name}”? Its tasks stay in the initiative.`} onConfirm={() => run(() => deleteMilestone(m.id), { success: "Removed" })}>
                      <Trash2 size={14} />
                    </ConfirmButton>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
        {!milestones.length && <li className="text-[13.5px] text-ink-3">No gates yet. Add the checkpoints the MD will review.</li>}
      </ol>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit gate" : "Add gate"}
        footer={
          <>
            <button className="btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveMilestone({ id: edit!.id, initiativeId, name: edit!.name ?? "", dueDate: edit!.dueDate ?? "", criteria: edit!.criteria ?? "" }), { success: "Saved", onDone: () => setEdit(null) })}>
              Save
            </button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-3">
            <label className="field">
              <span className="label">Gate</span>
              <input className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Day 30: everyone tracked" />
            </label>
            <label className="field">
              <span className="label">Date</span>
              <input className="input" type="date" value={edit.dueDate ?? ""} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Done when</span>
              <textarea className="textarea" value={edit.criteria ?? ""} onChange={(e) => setEdit({ ...edit, criteria: e.target.value })} />
            </label>
          </div>
        )}
      </Dialog>
    </section>
  );
}
