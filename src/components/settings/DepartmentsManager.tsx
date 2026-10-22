"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { saveDepartment } from "@/lib/actions/admin";
import { Dialog, FormError, PersonPicker, KeepForm, SubmitButton, toast, type PickPerson } from "../ui/client";

type D = { id: string; name: string; code: string; portfolio: string; headPersonId: string | null; directorPersonId: string | null; sort: number; active: boolean; members: number };

export function DepartmentsManager({ departments, people }: { departments: D[]; people: PickPerson[] }) {
  const [edit, setEdit] = useState<D | null>(null);
  const pn = new Map(people.map((p) => [p.id, p.name + (p.vacancy ? " (new hire)" : "")]));
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button className="btn btn-primary" onClick={() => setEdit({ id: "", name: "", code: "", portfolio: "", headPersonId: null, directorPersonId: null, sort: departments.length, active: true, members: 0 })}>
          <Plus size={15} /> Add department
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Portfolio</th>
              <th>Head</th>
              <th>Director</th>
              <th className="num">People</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className={d.active ? "" : "opacity-50"}>
                <td>
                  <span className="font-[550]">{d.name}</span> <span className="text-[12px] text-ink-3">{d.code}</span>
                </td>
                <td className="text-[13px]">{d.portfolio}</td>
                <td className="text-[13px]">{pn.get(d.headPersonId ?? "") ?? <span className="text-phase-y">not set</span>}</td>
                <td className="text-[13px]">{pn.get(d.directorPersonId ?? "") ?? ""}</td>
                <td className="num">{d.members}</td>
                <td className="text-right">
                  <button className="btn btn-sm" onClick={() => setEdit(d)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">The head and director of a department can see all its people&apos;s work and enter its KPIs.</p>
      {edit && <DeptDialog d={edit} people={people} onClose={() => setEdit(null)} />}
    </div>
  );
}

function DeptDialog({ d, people, onClose }: { d: D; people: PickPerson[]; onClose: () => void }) {
  const [state, action] = useActionState(saveDepartment, null);
  useEffect(() => {
    if (state?.ok) {
      toast("Saved");
      onClose();
    }
  }, [state, onClose]);
  return (
    <Dialog open onClose={onClose} title={d.id ? `Edit ${d.name}` : "Add a department"}>
      <KeepForm action={action} className="grid gap-3">
        <input type="hidden" name="id" value={d.id} />
        <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
          <label className="field">
            <span className="label">Name</span>
            <input className="input" name="name" defaultValue={d.name} required />
          </label>
          <label className="field">
            <span className="label">Short code</span>
            <input className="input" name="code" defaultValue={d.code} maxLength={6} />
          </label>
        </div>
        <label className="field">
          <span className="label">Portfolio</span>
          <input className="input" name="portfolio" defaultValue={d.portfolio} placeholder="e.g. Operations" />
        </label>
        <div className="field">
          <span className="label">Head</span>
          <PersonPicker people={people} value={d.headPersonId} name="headPersonId" allowEmpty emptyLabel="Not set" />
        </div>
        <div className="field">
          <span className="label">Director</span>
          <PersonPicker people={people} value={d.directorPersonId} name="directorPersonId" allowEmpty emptyLabel="None" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span className="label">Order</span>
            <input className="input num" name="sort" type="number" defaultValue={d.sort} />
          </label>
          <label className="mt-6 flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="inactive" defaultChecked={!d.active} className="size-4 accent-brand" /> Closed department
          </label>
        </div>
        <FormError state={state && !state.ok ? state : null} />
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton>Save</SubmitButton>
        </div>
      </KeepForm>
    </Dialog>
  );
}
