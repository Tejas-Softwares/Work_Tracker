"use client";

import { useState } from "react";
import { addCheckin, closePlan } from "@/lib/actions/scores";
import { formatDate } from "@/lib/domain/dates";
import { cx } from "../ui/bits";
import { useAction } from "../ui/client";

const PROGRESS: Record<string, [string, string]> = {
  on_track: ["On track", "var(--color-earth)"],
  some_progress: ["Some progress", "var(--color-ink-2)"],
  off_track: ["Off track", "var(--color-phase-y)"],
};

export function PlanRecord({
  planId,
  active,
  canEdit,
  today,
  endDate,
  goals,
  checkins,
}: {
  planId: string;
  active: boolean;
  canEdit: boolean;
  today: string;
  endDate: string;
  goals: { text: string; measure: string; met: boolean | null }[];
  checkins: { id: string; heldOn: string; progress: string; note: string; author: string }[];
}) {
  const [heldOn, setHeldOn] = useState(today);
  const [progress, setProgress] = useState("some_progress");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [met, setMet] = useState<(boolean | null)[]>(goals.map((g) => g.met));
  const [outcome, setOutcome] = useState("improved");
  const [why, setWhy] = useState("");
  const { pending, run } = useAction();
  return (
    <>
      <section>
        <h2 className="section-title mb-2">Goals</h2>
        <ol className="grid gap-2">
          {goals.map((g, i) => (
            <li key={i} className="flex flex-wrap items-start gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0 flex-1">
                <div className="font-[550]">{g.text}</div>
                <div className="text-[13px] text-ink-2">Measured by: {g.measure}</div>
              </div>
              {closing ? (
                <div className="flex gap-1">
                  {[
                    [true, "Met"],
                    [false, "Not met"],
                  ].map(([val, label]) => (
                    <button key={String(val)} className={cx("btn btn-sm", met[i] === val && "border-brand bg-brand-wash text-navy")} onClick={() => setMet((m) => m.map((x, j) => (j === i ? (val as boolean) : x)))}>
                      {label as string}
                    </button>
                  ))}
                </div>
              ) : (
                g.met !== null && <span className={cx("chip", g.met ? "bg-earth-wash text-earth" : "bg-phase-y-wash text-phase-y")}>{g.met ? "Met" : "Not met"}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title mb-2">Weekly check-ins ({checkins.length})</h2>
        {active && canEdit && (
          <div className="mb-3 grid gap-2 rounded-lg border border-line p-3">
            <div className="flex flex-wrap gap-2">
              <input className="input" type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} style={{ width: 170, height: 32 }} aria-label="Date" />
              {Object.entries(PROGRESS).map(([k, [label]]) => (
                <button key={k} className={cx("btn btn-sm", progress === k && "border-brand bg-brand-wash text-navy")} onClick={() => setProgress(k)} aria-pressed={progress === k}>
                  {label}
                </button>
              ))}
            </div>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was discussed, what changed, what was agreed for next week" />
            <div>
              <button className="btn btn-primary btn-sm" disabled={pending || !note.trim()} onClick={() => run(() => addCheckin(planId, { heldOn, progress, note }), { onDone: () => setNote("") })}>
                Add check-in
              </button>
            </div>
          </div>
        )}
        <ol className="grid gap-2">
          {checkins.map((c) => (
            <li key={c.id} className="rounded-lg border border-line p-3">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-semibold">{formatDate(c.heldOn, today)}</span>
                <span style={{ color: PROGRESS[c.progress]?.[1] }}>{PROGRESS[c.progress]?.[0]}</span>
              </div>
              <p className="mt-1 text-[14px] whitespace-pre-wrap">{c.note}</p>
              {c.author && <p className="mt-1 text-[12px] text-ink-3">{c.author}</p>}
            </li>
          ))}
          {!checkins.length && <li className="text-[13.5px] text-ink-3">No check-ins yet. Hold one every week.</li>}
        </ol>
      </section>

      {active && canEdit && (
        <section className="rounded-lg border border-line p-4">
          {!closing ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13.5px] text-ink-2">{endDate <= today ? "The plan period is over. Record the outcome." : `Record the outcome on or after ${formatDate(endDate, today)}.`}</span>
              <button className="btn btn-sm" onClick={() => setClosing(true)}>
                Record outcome
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <h2 className="section-title">Outcome</h2>
              <p className="text-[13px] text-ink-2">Mark each goal above as met or not met, then choose the outcome.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["improved", "Improved: plan closed"],
                  ["extended", "Extend 30 days"],
                  ["role_change", "Move to a better-fitting role"],
                  ["exit", "Exit, handled by HR"],
                ].map(([k, label]) => (
                  <button key={k} className={cx("btn btn-sm", outcome === k && "border-brand bg-brand-wash text-navy")} onClick={() => setOutcome(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea className="textarea" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The reasons, based on the goals and check-ins" />
              {outcome === "exit" && <p className="text-[12.5px] text-phase-y">An exit follows the appointment letter and the labour codes. HR handles notice and settlement.</p>}
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" disabled={pending || !why.trim()} onClick={() => run(() => closePlan(planId, { outcome, note: why, goalsMet: met }), { success: "Outcome recorded", onDone: () => setClosing(false) })}>
                  Save outcome
                </button>
                <button className="btn btn-sm" onClick={() => setClosing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
