"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveRhythm } from "@/lib/actions/meetings";
import { WEEKDAY_NAMES } from "@/lib/domain/dates";
import { Dialog, PersonPicker, useAction, type PickPerson } from "../ui/client";

type R = { id: string; title: string; kind: string; departmentId: string | null; cadence: string; day: number | null; time: string; durationMin: number; chairPersonId: string | null; purpose: string; active: boolean };

const KINDS: [string, string][] = [
  ["huddle", "Daily huddle"],
  ["project_review", "Project review"],
  ["management_review", "Management review"],
  ["monthly_review", "Monthly business review"],
  ["quarterly_review", "Quarterly review"],
  ["other", "Other"],
];

export function RhythmEditor({ rhythm, people, departments }: { rhythm?: R; people: PickPerson[]; departments: { id: string; name: string }[] }) {
  const blank: R = { id: "", title: "", kind: "huddle", departmentId: null, cadence: "daily", day: null, time: "09:30", durationMin: 15, chairPersonId: null, purpose: "", active: true };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<R>(rhythm ?? blank);
  const { pending, run } = useAction();
  const set = (p: Partial<R>) => setF((s) => ({ ...s, ...p }));
  return (
    <>
      {rhythm ? (
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setF(rhythm); setOpen(true); }} aria-label={`Edit ${rhythm.title}`}>
          <Pencil size={14} />
        </button>
      ) : (
        <button className="btn btn-sm" onClick={() => { setF(blank); setOpen(true); }}>
          <Plus size={14} /> Add meeting
        </button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={rhythm ? "Edit meeting" : "Add a meeting to the rhythm"}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveRhythm({ ...f, id: f.id || undefined }), { success: "Saved", onDone: () => setOpen(false) })}>
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="field">
            <span className="label">Name</span>
            <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="label">Kind</span>
              <select className="select" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Department</span>
              <select className="select" value={f.departmentId ?? ""} onChange={(e) => set({ departmentId: e.target.value || null })}>
                <option value="">Company-wide (heads)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">How often</span>
              <select className="select" value={f.cadence} onChange={(e) => set({ cadence: e.target.value, day: e.target.value === "weekly" ? 1 : e.target.value === "monthly" ? 7 : null })}>
                <option value="daily">Every working day</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
            {f.cadence === "weekly" && (
              <label className="field">
                <span className="label">Day</span>
                <select className="select" value={f.day ?? 1} onChange={(e) => set({ day: Number(e.target.value) })}>
                  {WEEKDAY_NAMES.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {f.cadence === "monthly" && (
              <label className="field">
                <span className="label">Day of the month</span>
                <input className="input num" type="number" min={1} max={28} value={f.day ?? 1} onChange={(e) => set({ day: Number(e.target.value) })} />
              </label>
            )}
            <label className="field">
              <span className="label">Time</span>
              <input className="input" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Minutes</span>
              <input className="input num" type="number" min={5} max={480} value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} />
            </label>
          </div>
          <div className="field">
            <span className="label">Chair</span>
            <PersonPicker people={people} value={f.chairPersonId} allowEmpty emptyLabel="No chair" onChange={(id) => set({ chairPersonId: id })} />
          </div>
          <label className="field">
            <span className="label">Purpose</span>
            <input className="input" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="size-4 accent-brand" checked={!f.active} onChange={(e) => set({ active: !e.target.checked })} /> Paused
          </label>
        </div>
      </Dialog>
    </>
  );
}
