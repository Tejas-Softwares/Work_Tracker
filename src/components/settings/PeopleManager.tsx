"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { moveReports, savePerson } from "@/lib/actions/admin";
import { Avatar } from "../ui/bits";
import { Dialog, FormError, PersonPicker, KeepForm, SubmitButton, toast, useAction } from "../ui/client";

type P = {
  id: string;
  name: string;
  designation: string;
  departmentId: string | null;
  reportsTo: string | null;
  email: string;
  phone: string;
  isVacancy: boolean;
  active: boolean;
  rolePurpose: string;
  behaviours: string[];
  dottedLine: string;
  joinedOn: string;
  reports: number;
};

export function PeopleManager({ people, departments }: { people: P[]; departments: { id: string; name: string }[] }) {
  const [edit, setEdit] = useState<P | null>(null);
  const [q, setQ] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [move, setMove] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const { pending, run } = useAction();
  const dn = new Map(departments.map((d) => [d.id, d.name]));
  const pn = new Map(people.map((p) => [p.id, p.name]));
  const pick = people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, designation: p.designation, vacancy: p.isVacancy }));
  const s = q.toLowerCase();
  const list = people.filter((p) => (showLeft || p.active) && (!s || p.name.toLowerCase().includes(s) || p.designation.toLowerCase().includes(s) || (dn.get(p.departmentId ?? "") ?? "").toLowerCase().includes(s)));
  const blank: P = { id: "", name: "", designation: "", departmentId: null, reportsTo: null, email: "", phone: "", isVacancy: false, active: true, rolePurpose: "", behaviours: [], dottedLine: "", joinedOn: "", reports: 0 };

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-line p-4">
        <h2 className="section-title">When a new head joins</h2>
        <p className="mt-1 mb-3 text-[13.5px] text-ink-2">
          Add them below (or edit their new-hire seat: untick New hire and put their name in), then move everyone who reports to the interim manager across in one step.
        </p>
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="field">
            <span className="label">Everyone who reports to</span>
            <PersonPicker people={pick.filter((p) => people.find((x) => x.id === p.id)!.reports > 0)} value={move.from} onChange={(id) => setMove((m) => ({ ...m, from: id }))} compact />
          </div>
          <div className="field">
            <span className="label">now reports to</span>
            <PersonPicker people={pick} value={move.to} onChange={(id) => setMove((m) => ({ ...m, to: id }))} compact />
          </div>
          <button
            className="btn btn-primary"
            disabled={!move.from || !move.to || pending}
            onClick={() => run(() => moveReports(move.from!, move.to!), { onDone: (r) => { toast(`Moved ${(r.data as { moved: number }).moved} people`); setMove({ from: null, to: null }); } })}
          >
            Move
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">To move only some people, edit each one&apos;s Reports to below.</p>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input className="input" style={{ maxWidth: 300, height: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" />
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="size-4 accent-brand" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show people who have left
          </label>
          <button className="btn btn-primary ml-auto" onClick={() => setEdit(blank)}>
            <Plus size={15} /> Add person
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Reports to</th>
                <th>Email</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={p.name} size={24} vacancy={p.isVacancy} />
                      <div>
                        <div className="font-[550]">
                          {p.name}
                          {p.isVacancy && <span className="ml-1.5 text-[12px] font-normal text-ink-3">new hire seat</span>}
                          {!p.active && <span className="ml-1.5 text-[12px] font-normal text-ink-3">left</span>}
                        </div>
                        <div className="text-[12px] text-ink-3">{p.designation}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-[13px]">{dn.get(p.departmentId ?? "") ?? ""}</td>
                  <td className="text-[13px]">{pn.get(p.reportsTo ?? "") ?? ""}</td>
                  <td className="text-[13px] text-ink-2">{p.email || <span className="text-phase-y">missing</span>}</td>
                  <td className="text-right">
                    <button className="btn btn-sm" onClick={() => setEdit(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">Add each person&apos;s work email: when they sign up with it, their account links to their name by itself.</p>
      </section>
      {edit && <PersonDialog person={edit} people={pick.filter((x) => x.id !== edit.id)} departments={departments} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PersonDialog({ person, people, departments, onClose }: { person: P; people: { id: string; name: string; vacancy?: boolean }[]; departments: { id: string; name: string }[]; onClose: () => void }) {
  const [state, action] = useActionState(savePerson, null);
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Saved");
      onClose();
    }
  }, [state, onClose]);
  return (
    <Dialog open onClose={onClose} title={person.id ? `Edit ${person.name}` : "Add a person"} width={640}>
      <KeepForm action={action} className="grid gap-3">
        <input type="hidden" name="id" value={person.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span className="label">Name</span>
            <input className="input" name="name" defaultValue={person.name} required />
          </label>
          <label className="field">
            <span className="label">Designation</span>
            <input className="input" name="designation" defaultValue={person.designation} />
          </label>
          <label className="field">
            <span className="label">Department</span>
            <select className="select" name="departmentId" defaultValue={person.departmentId ?? ""}>
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="label">Reports to</span>
            <PersonPicker people={people} value={person.reportsTo} name="reportsTo" allowEmpty emptyLabel="No one" />
          </div>
          <label className="field">
            <span className="label">Work email</span>
            <input className="input" name="email" type="email" defaultValue={person.email} />
          </label>
          <label className="field">
            <span className="label">Mobile</span>
            <input className="input" name="phone" defaultValue={person.phone} />
          </label>
          <label className="field">
            <span className="label">Dotted line to</span>
            <input className="input" name="dottedLine" defaultValue={person.dottedLine} placeholder="e.g. Cummins project manager" />
          </label>
          <label className="field">
            <span className="label">Joined</span>
            <input className="input" name="joinedOn" type="date" defaultValue={person.joinedOn} />
          </label>
        </div>
        <label className="field">
          <span className="label">Role purpose</span>
          <textarea className="textarea" name="rolePurpose" defaultValue={person.rolePurpose} style={{ minHeight: 60 }} />
        </label>
        <label className="field">
          <span className="label">Expected behaviours (one per line)</span>
          <textarea className="textarea" name="behaviours" defaultValue={person.behaviours.join("\n")} />
        </label>
        <div className="flex flex-wrap gap-5 text-[13.5px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isVacancy" defaultChecked={person.isVacancy} className="size-4 accent-brand" /> New hire seat (not filled yet)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inactive" defaultChecked={!person.active} className="size-4 accent-brand" /> Has left the company
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
