"use client";

import { useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { RoleCardEditor } from "./RoleCardEditor";

type K = { id: string; title: string; measure: string; target: string; weight: number };

export function RoleCard({ personId, purpose, behaviours, kras, canEdit, designation, reportsTo }: { personId: string; purpose: string; behaviours: string[]; kras: K[]; canEdit: boolean; designation: string; reportsTo: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <RoleCardEditor personId={personId} purpose={purpose} behaviours={behaviours} kras={kras} onDone={() => setEditing(false)} />;
  const total = kras.reduce((a, k) => a + k.weight, 0);
  return (
    <div className="grid gap-5">
      <div className="no-print flex justify-end gap-2">
        <button className="btn btn-sm" onClick={() => window.print()}>
          <Printer size={14} /> Print role card
        </button>
        {canEdit && (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit role card
          </button>
        )}
      </div>
      <div className="grid gap-1 text-[13.5px] sm:grid-cols-2">
        <p>
          <span className="text-ink-3">Role: </span>
          {designation}
        </p>
        <p>
          <span className="text-ink-3">Reports to: </span>
          {reportsTo || "No one"}
        </p>
      </div>
      <section>
        <h3 className="section-title mb-1">Why this role exists</h3>
        <p className="text-[14.5px] leading-relaxed">{purpose || <span className="text-ink-3">Not written yet.</span>}</p>
      </section>
      <section>
        <h3 className="section-title mb-2">
          Key result areas{" "}
          {kras.length > 0 && (
            <span className="num text-[12.5px] font-normal" style={{ color: total === 100 ? "var(--color-ink-3)" : "var(--color-phase-y)" }}>
              weights add to {total}%
            </span>
          )}
        </h3>
        {kras.length ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>KRA</th>
                  <th>How it is measured</th>
                  <th>Target</th>
                  <th className="num text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {kras.map((k) => (
                  <tr key={k.id}>
                    <td className="font-[550]">{k.title}</td>
                    <td className="text-ink-2">{k.measure}</td>
                    <td className="text-ink-2">{k.target}</td>
                    <td className="num text-right">{k.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">No KRAs yet.{canEdit ? " Use Edit role card to add 4 to 6." : ""}</p>
        )}
      </section>
      <section>
        <h3 className="section-title mb-1">Expected behaviours</h3>
        {behaviours.length ? (
          <ul className="list-disc pl-5 text-[14px] leading-relaxed">
            {behaviours.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-3">None listed.</p>
        )}
      </section>
      <p className="text-[12.5px] text-ink-3">Each month, KRAs count for 70% of the score and behaviours for 30%.</p>
    </div>
  );
}
