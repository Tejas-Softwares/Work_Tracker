"use client";

import { useState } from "react";
import { approveUser, rejectUser, updateUser } from "@/lib/actions/admin";
import { makeResetLink } from "@/lib/actions/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { Avatar, Notice } from "../ui/bits";
import { ConfirmButton, Dialog, PersonPicker, toast, useAction } from "../ui/client";

type U = { id: string; name: string; email: string; role: string; status: string; personId: string | null; lastLoginAt: string | null; createdAt: string };
type P = { id: string; name: string; designation?: string; dept?: string; taken: boolean; email: string | null };
type R = { value: string; label: string; help: string };

export function AccessManager({ users, people, roles, unlinkedPeople }: { users: U[]; people: P[]; roles: R[]; unlinkedPeople: number }) {
  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");
  const { run } = useAction();
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const guess = (u: U) => people.find((p) => p.email && p.email === u.email)?.id ?? people.find((p) => !p.taken && p.name.toLowerCase() === u.name.toLowerCase())?.id ?? people.find((p) => !p.taken && p.name.toLowerCase().split(" ")[0] === u.name.toLowerCase().split(" ")[0])?.id ?? null;

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="section-title mb-2">Waiting for approval {pending.length > 0 && <span className="num text-phase-y">{pending.length}</span>}</h2>
        {pending.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">
            No one is waiting. Send the team the address of this site with <b>/signup</b> at the end; their requests show up here.
            {unlinkedPeople > 0 && ` ${unlinkedPeople} people on the team list don't have an account yet.`}
          </p>
        ) : (
          <div className="grid gap-2">
            {pending.map((u) => (
              <PendingRow key={u.id} u={u} people={people} roles={roles} suggested={guess(u)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-2">Accounts</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Linked to</th>
                <th>Role</th>
                <th>Last signed in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {others.map((u) => (
                <tr key={u.id} className={u.status === "disabled" ? "opacity-60" : ""}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} size={28} />
                      <div className="min-w-0">
                        <div className="font-semibold">{u.name}</div>
                        <div className="text-[12.5px] text-ink-3">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <PersonPicker
                      people={people.filter((p) => !p.taken || p.id === u.personId)}
                      value={u.personId}
                      allowEmpty
                      emptyLabel="Not linked"
                      placeholder="Not linked"
                      label="Linked to"
                      compact
                      onChange={(id) => run(() => updateUser(u.id, { personId: id }), { success: "Linked" })}
                    />
                  </td>
                  <td>
                    <select className="select" style={{ height: 30, width: 150 }} value={u.role} onChange={(e) => run(() => updateUser(u.id, { role: e.target.value }), { success: "Role changed" })} title={roles.find((r) => r.value === u.role)?.help}>
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-[13px] whitespace-nowrap text-ink-2">{u.status === "disabled" ? "Turned off" : u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        run(() => makeResetLink(u.id), {
                          onDone: (r) => setLink({ name: u.name, url: (r.data as { link: string }).link }),
                        })
                      }
                    >
                      Reset link
                    </button>
                    {u.status === "disabled" ? (
                      <button className="btn btn-sm btn-ghost" onClick={() => run(() => updateUser(u.id, { status: "active" }), { success: "Turned on" })}>
                        Turn on
                      </button>
                    ) : (
                      <ConfirmButton className="btn btn-sm btn-ghost text-phase-r" confirm={`${u.name} won't be able to sign in. Their tasks and history stay.`} onConfirm={() => run(() => updateUser(u.id, { status: "disabled" }), { success: "Turned off" })}>
                        Turn off
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-3 grid gap-1 text-[12.5px] text-ink-2 sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r.value}>
              <dt className="inline font-semibold">{r.label}: </dt>
              <dd className="inline">{r.help}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog open={!!link} onClose={() => setLink(null)} title={`Reset link for ${link?.name ?? ""}`} width={520}>
        <p className="mb-3 text-[13.5px] text-ink-2">Send this to them on WhatsApp or email. It works once and lasts 24 hours.</p>
        <div className="flex gap-2">
          <input className="input" readOnly value={link?.url ?? ""} onFocus={(e) => e.target.select()} />
          <button
            className="btn btn-primary"
            onClick={() => {
              navigator.clipboard?.writeText(link?.url ?? "");
              toast("Copied");
            }}
          >
            Copy
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function PendingRow({ u, people, roles, suggested }: { u: U; people: P[]; roles: R[]; suggested: string | null }) {
  const [personId, setPersonId] = useState<string | null>(u.personId ?? suggested);
  const [role, setRole] = useState("member");
  const { pending, run } = useAction();
  return (
    <div className="grid items-center gap-3 rounded-lg border border-[#f0d48f] bg-phase-y-wash/40 p-3 md:grid-cols-[1.2fr_1.4fr_160px_auto]">
      <div className="flex items-center gap-2.5">
        <Avatar name={u.name} size={30} />
        <div className="min-w-0">
          <div className="font-semibold">{u.name}</div>
          <div className="truncate text-[12.5px] text-ink-3">
            {u.email}, asked {formatDateTime(u.createdAt)}
          </div>
        </div>
      </div>
      <div>
        <span className="label mb-1 block">This is</span>
        <PersonPicker people={people.filter((p) => !p.taken || p.id === personId)} value={personId} onChange={setPersonId} placeholder="Pick their name on the team list" label="This is" compact />
        {!personId && <span className="hint">Without a name they can sign in but can&apos;t be given tasks.</span>}
      </div>
      <label className="field">
        <span className="label">Role</span>
        <select className="select" style={{ height: 30 }} value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 md:justify-end">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => approveUser(u.id, role, personId), { success: `${u.name} approved` })}>
          Approve
        </button>
        <ConfirmButton className="btn btn-sm" confirm={`${u.name}'s request will be removed. They can ask again.`} onConfirm={() => run(() => rejectUser(u.id), { success: "Request removed" })}>
          Turn down
        </ConfirmButton>
      </div>
      {!personId && people.length === 0 && (
        <div className="md:col-span-4">
          <Notice tone="warn">The team list is empty. Import the team workbook first, then link accounts to names.</Notice>
        </div>
      )}
    </div>
  );
}
