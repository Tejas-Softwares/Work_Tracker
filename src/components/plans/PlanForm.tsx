"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createPlan } from "@/lib/actions/scores";
import { PersonPicker, useAction, type PickPerson } from "../ui/client";

export function PlanForm({ people, personId, start, end }: { people: PickPerson[]; personId: string | null; start: string; end: string }) {
  const router = useRouter();
  const [pid, setPid] = useState(personId);
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [reason, setReason] = useState("");
  const [support, setSupport] = useState("");
  const [goals, setGoals] = useState([{ text: "", measure: "" }]);
  const { pending, run } = useAction();
  return (
    <div className="grid gap-4">
      <div className="field">
        <span className="label">Person</span>
        <PersonPicker people={people} value={pid} onChange={setPid} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="label">Starts</span>
          <input className="input" type="date" value={s} onChange={(x) => setS(x.target.value)} />
        </label>
        <label className="field">
          <span className="label">Ends</span>
          <input className="input" type="date" value={e} onChange={(x) => setE(x.target.value)} />
          <span className="hint">The structure plan suggests 60 days.</span>
        </label>
      </div>
      <label className="field">
        <span className="label">Why the plan is needed</span>
        <textarea className="textarea" value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Facts only: scores for the last two months, tasks missed, specific examples with dates." />
      </label>
      <div>
        <span className="label mb-1.5 block">Goals for the plan period</span>
        <div className="grid gap-2">
          {goals.map((g, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="input" value={g.text} onChange={(x) => setGoals((l) => l.map((y, j) => (j === i ? { ...y, text: x.target.value } : y)))} placeholder="Goal, e.g. RA bills on time" aria-label="Goal" />
              <input className="input" value={g.measure} onChange={(x) => setGoals((l) => l.map((y, j) => (j === i ? { ...y, measure: x.target.value } : y)))} placeholder="Measured by, e.g. 100% within 5 days" aria-label="Measure" />
              <button className="btn btn-ghost btn-icon" onClick={() => setGoals((l) => l.filter((_, j) => j !== i))} aria-label="Remove goal" disabled={goals.length === 1}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-sm mt-2" onClick={() => setGoals((l) => [...l, { text: "", measure: "" }])}>
          <Plus size={14} /> Add goal
        </button>
      </div>
      <label className="field">
        <span className="label">Support the company will give</span>
        <textarea className="textarea" value={support} onChange={(x) => setSupport(x.target.value)} placeholder="Training, a buddy, clearer handoffs, tools, weekly time with the manager." />
      </label>
      <div>
        <button
          className="btn btn-primary"
          disabled={pending || !pid}
          onClick={() => run(() => createPlan(pid!, { startDate: s, endDate: e, reason, support, goals }), { success: "Plan started", onDone: (r) => router.push(`/plans/${(r.data as { id: string }).id}`) })}
        >
          Start the plan
        </button>
      </div>
    </div>
  );
}
