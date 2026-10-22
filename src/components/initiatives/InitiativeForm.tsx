"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveInitiative } from "@/lib/actions/initiatives";
import { Dialog, PersonPicker, useAction, type PickPerson } from "../ui/client";

type I = { id?: string; name: string; description: string; ownerPersonId: string | null; startDate: string; endDate: string; status: string };

export function InitiativeForm({ people, initiative }: { people: PickPerson[]; initiative?: I }) {
  const router = useRouter();
  const blank: I = { name: "", description: "", ownerPersonId: null, startDate: "", endDate: "", status: "active" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<I>(initiative ?? blank);
  const { pending, run } = useAction();
  const set = (p: Partial<I>) => setF((s) => ({ ...s, ...p }));
  return (
    <>
      <button className="btn" onClick={() => { setF(initiative ?? blank); setOpen(true); }}>
        {initiative ? <Pencil size={15} /> : <Plus size={15} />} {initiative ? "Edit" : "New initiative"}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={initiative ? "Edit initiative" : "New initiative"}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                run(() => saveInitiative(f), {
                  success: "Saved",
                  onDone: (r) => {
                    setOpen(false);
                    if (!initiative) router.push(`/initiatives/${(r.data as { id: string }).id}`);
                  },
                })
              }
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="field">
            <span className="label">Name</span>
            <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">What it achieves</span>
            <textarea className="textarea" value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="field">
            <span className="label">Owner</span>
            <PersonPicker people={people} value={f.ownerPersonId} onChange={(id) => set({ ownerPersonId: id })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span className="label">Start</span>
              <input className="input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">End</span>
              <input className="input" type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Status</span>
              <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>
        </div>
      </Dialog>
    </>
  );
}
