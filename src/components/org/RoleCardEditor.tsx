"use client";

import { useState } from "react";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";
import { saveRoleCard } from "@/lib/actions/people";
import { useAction } from "../ui/client";

type K = { id?: string; title: string; measure: string; target: string; weight: number };

export function RoleCardEditor({ personId, purpose, behaviours, kras, onDone }: { personId: string; purpose: string; behaviours: string[]; kras: K[]; onDone: () => void }) {
  const [p, setP] = useState(purpose);
  const [b, setB] = useState(behaviours.join("\n"));
  const [list, setList] = useState<K[]>(kras.length ? kras : [{ title: "", measure: "", target: "", weight: 25 }]);
  const { pending, run } = useAction();
  const total = list.reduce((a, k) => a + (Number(k.weight) || 0), 0);
  const set = (i: number, patch: Partial<K>) => setList((l) => l.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const move = (i: number, d: number) =>
    setList((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
      return n;
    });

  return (
    <div className="grid gap-4">
      <label className="field">
        <span className="label">Role purpose</span>
        <textarea className="textarea" style={{ minHeight: 60 }} value={p} onChange={(e) => setP(e.target.value)} placeholder="One sentence: why this role exists" />
      </label>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label">KRAs</span>
          <span className="num text-[12.5px]" style={{ color: total === 100 ? "var(--color-earth)" : "var(--color-phase-y)" }}>
            Weights add up to {total}%{total !== 100 ? " (aim for 100)" : ""}
          </span>
        </div>
        <div className="grid gap-2">
          {list.map((k, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-line p-2.5 sm:grid-cols-[1.3fr_1.4fr_1fr_70px_auto]">
              <input className="input" style={{ height: 32 }} value={k.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="KRA, e.g. RA bills on time" aria-label="KRA" />
              <input className="input" style={{ height: 32 }} value={k.measure} onChange={(e) => set(i, { measure: e.target.value })} placeholder="How it is measured" aria-label="Measure" />
              <input className="input" style={{ height: 32 }} value={k.target} onChange={(e) => set(i, { target: e.target.value })} placeholder="Target" aria-label="Target" />
              <input className="input num" style={{ height: 32 }} type="number" min={0} max={100} value={k.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} aria-label="Weight %" />
              <div className="flex items-center">
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === list.length - 1}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="Remove KRA">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {list.length < 8 && (
          <button type="button" className="btn btn-sm mt-2" onClick={() => setList((l) => [...l, { title: "", measure: "", target: "", weight: 0 }])}>
            <Plus size={14} /> Add KRA
          </button>
        )}
      </div>
      <label className="field">
        <span className="label">Expected behaviours (one per line)</span>
        <textarea className="textarea" value={b} onChange={(e) => setB(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => saveRoleCard(personId, { rolePurpose: p, behaviours: b.split("\n"), kras: list }), { success: "Role card saved", onDone })}
        >
          {pending ? "Saving…" : "Save role card"}
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
