"use client";

import { useMemo, useState } from "react";
import { saveScorecard, acknowledgeScorecard } from "@/lib/actions/scores";
import { kraAverage, overallScore, band, BAND_LABEL } from "@/lib/domain/scoring";
import { cx, Figure, Notice } from "../ui/bits";
import { toast, useAction } from "../ui/client";

type Kra = { id: string; title: string; measure: string; target: string; weight: number };
type Card = { status: string; kra: Record<string, { score: number | null; note: string }>; behaviour: number | null; strengths: string; improve: string; comment: string; employeeComment: string; acknowledgedAt: string | null };
type Stats = { onTimePct: number | null; due: number; matured: number; onTime: number; late: number; done: number; slips: number; overdueNow: number };

const SCALE = [
  [1, "Not done"],
  [2, "Partly"],
  [3, "Met"],
  [4, "Above"],
  [5, "Well above"],
] as const;

function ScorePicker({ value, onChange, disabled, label, suggested }: { value: number | null; onChange: (n: number) => void; disabled: boolean; label: string; suggested?: number | null }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {SCALE.map(([n, text]) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          disabled={disabled}
          onClick={() => onChange(n)}
          title={text}
          className={cx(
            "relative flex h-9 min-w-[44px] flex-col items-center justify-center rounded-md border px-2 text-[13px] leading-none font-semibold transition-colors",
            value === n ? (n < 3 ? "border-phase-y-mark bg-phase-y-wash text-phase-y" : "border-brand bg-brand text-white") : "border-line-strong bg-white text-ink-2 hover:bg-wash",
            disabled && value !== n && "opacity-50",
          )}
        >
          {n}
          <span className={cx("mt-0.5 text-[9.5px] font-normal", value === n && n >= 3 ? "text-white/80" : "text-ink-3")}>{text}</span>
          {suggested === n && value !== n && <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full bg-earth-mark" title="Suggested from on-time delivery" />}
        </button>
      ))}
    </div>
  );
}

export function ScoreForm({
  personId,
  personName,
  month,
  monthText,
  editable,
  self,
  kras,
  behaviours,
  card,
  prev,
  stats,
  suggested,
}: {
  personId: string;
  personName: string;
  month: string;
  monthText: string;
  editable: boolean;
  self: boolean;
  kras: Kra[];
  behaviours: string[];
  card: Card | null;
  prev: { overall: number | null; kra: Record<string, number | null> } | null;
  stats: Stats;
  suggested: number | null;
}) {
  const [kra, setKra] = useState<Record<string, { score: number | null; note: string }>>(() => Object.fromEntries(kras.map((k) => [k.id, card?.kra[k.id] ?? { score: null, note: "" }])));
  const [behaviour, setBehaviour] = useState<number | null>(card?.behaviour ?? null);
  const [strengths, setStrengths] = useState(card?.strengths ?? "");
  const [improve, setImprove] = useState(card?.improve ?? "");
  const [comment, setComment] = useState(card?.comment ?? "");
  const [ack, setAck] = useState(card?.employeeComment ?? "");
  const { pending, run } = useAction();

  const avg = useMemo(() => kraAverage(kras.map((k) => ({ score: kra[k.id]?.score, weight: k.weight }))), [kra, kras]);
  const overall = overallScore(avg, behaviour);
  const b = band(overall);
  const scoredCount = kras.filter((k) => kra[k.id]?.score).length;
  const onTimeKra = kras.find((k) => /on time/i.test(k.title) && /task/i.test(k.title));
  const ro = !editable;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-5">
        {card?.status === "draft" && editable && <Notice>Draft. {personName} can&apos;t see it until you share it.</Notice>}
        {kras.length === 0 && <Notice tone="warn">{personName} has no KRAs yet. Add them on the role card first; behaviours can still be scored.</Notice>}

        <section>
          <h2 className="section-title mb-2">KRAs, 70% of the score</h2>
          <ol className="grid gap-3">
            {kras.map((k, i) => (
              <li key={k.id} className="rounded-lg border border-line p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[14.5px] font-semibold">
                    {i + 1}. {k.title}
                  </h3>
                  <span className="num text-[12.5px] text-ink-3">
                    weight {k.weight}%{prev?.kra[k.id] ? `, last month ${prev.kra[k.id]}` : ""}
                  </span>
                </div>
                {(k.measure || k.target) && (
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    {k.measure}
                    {k.measure && k.target ? ". " : ""}
                    {k.target && <span>Target: {k.target}</span>}
                  </p>
                )}
                <div className="mt-2.5">
                  <ScorePicker label={k.title} value={kra[k.id]?.score ?? null} disabled={ro || pending} onChange={(n) => setKra((s) => ({ ...s, [k.id]: { ...s[k.id], score: n } }))} suggested={k.id === onTimeKra?.id ? suggested : undefined} />
                </div>
                {k.id === onTimeKra?.id && stats.onTimePct !== null && editable && (
                  <p className="mt-1.5 text-[12px] text-earth">
                    The tracker shows {stats.onTimePct}% on time ({stats.onTime} of {stats.matured}); that suggests {suggested}.
                  </p>
                )}
                {(editable || kra[k.id]?.note) && (
                  <input
                    className="input mt-2"
                    style={{ height: 32, fontSize: 13 }}
                    placeholder="Evidence: what happened this month"
                    value={kra[k.id]?.note ?? ""}
                    readOnly={ro}
                    onChange={(e) => setKra((s) => ({ ...s, [k.id]: { ...s[k.id], note: e.target.value } }))}
                    aria-label={`Note for ${k.title}`}
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-lg border border-line p-3.5">
          <h2 className="section-title">Behaviours, 30% of the score</h2>
          {behaviours.length > 0 && (
            <ul className="mt-1 mb-2.5 list-disc pl-5 text-[13px] text-ink-2">
              {behaviours.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <ScorePicker label="Behaviours" value={behaviour} disabled={ro || pending} onChange={setBehaviour} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span className="label">What went well</span>
            <textarea className="textarea" value={strengths} onChange={(e) => setStrengths(e.target.value)} readOnly={ro} />
          </label>
          <label className="field">
            <span className="label">What to improve next month</span>
            <textarea className="textarea" value={improve} onChange={(e) => setImprove(e.target.value)} readOnly={ro} />
          </label>
          <label className="field sm:col-span-2">
            <span className="label">Manager&apos;s comment</span>
            <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} readOnly={ro} />
          </label>
        </section>

        {editable && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveScorecard(personId, month, { kra, behaviour, strengths, improve, comment }, true), { onDone: (r) => toast(r.message ?? "Saved") })}>
              {card && card.status !== "draft" ? "Save changes" : `Share with ${personName.split(" ")[0]}`}
            </button>
            {(!card || card.status === "draft") && (
              <button className="btn" disabled={pending} onClick={() => run(() => saveScorecard(personId, month, { kra, behaviour, strengths, improve, comment }, false), { success: "Draft saved" })}>
                Save draft
              </button>
            )}
          </div>
        )}

        {self && card && (
          <section className="rounded-lg border border-line bg-wash p-4">
            {card.acknowledgedAt ? (
              <>
                <h2 className="section-title">You read this scorecard</h2>
                {card.employeeComment && <p className="mt-1 text-[14px] whitespace-pre-wrap">{card.employeeComment}</p>}
              </>
            ) : (
              <>
                <h2 className="section-title">Your response</h2>
                <p className="mb-2 text-[13px] text-ink-2">Add anything your manager should know, then confirm you&apos;ve read it.</p>
                <textarea className="textarea" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="Optional" />
                <button className="btn btn-primary mt-2" disabled={pending} onClick={() => run(() => acknowledgeScorecard(personId, month, ack), { onDone: (r) => toast(r.message ?? "Done") })}>
                  I&apos;ve read my scorecard
                </button>
              </>
            )}
          </section>
        )}
        {!self && card?.employeeComment && (
          <section className="rounded-lg border border-line bg-wash p-4">
            <h2 className="section-title">{personName.split(" ")[0]}&apos;s response</h2>
            <p className="mt-1 text-[14px] whitespace-pre-wrap">{card.employeeComment}</p>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-20">
        <section className="rounded-lg border border-line p-4">
          <div className="text-[12.5px] font-semibold text-ink-2">{monthText} score</div>
          <div className="num mt-1 text-[40px] leading-none font-bold" style={{ fontStretch: "88%", color: overall !== null && overall < 3 ? "var(--color-phase-y)" : "var(--color-navy)" }}>
            {overall === null ? "–" : overall.toFixed(2)}
          </div>
          <div className="mt-1 text-[13px] text-ink-2">{b ? BAND_LABEL[b] : "Score the KRAs and behaviours"}</div>
          {prev?.overall != null && overall !== null && (
            <div className="mt-1 text-[12.5px] text-ink-3">
              {overall > prev.overall ? "Up" : overall < prev.overall ? "Down" : "Same as"} {overall !== prev.overall ? `from ${prev.overall.toFixed(2)}` : "last month"}
            </div>
          )}
          <div className="mt-3 grid gap-1 text-[12.5px] text-ink-2">
            <div className="flex justify-between">
              <span>KRAs (70%)</span>
              <span className="num">{avg === null ? "–" : avg.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Behaviours (30%)</span>
              <span className="num">{behaviour ?? "–"}</span>
            </div>
            <div className="flex justify-between">
              <span>KRAs scored</span>
              <span className="num">
                {scoredCount} of {kras.length}
              </span>
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-line p-4">
          <div className="mb-2 text-[12.5px] font-semibold text-ink-2">From the tracker, {monthText}</div>
          <div className="grid grid-cols-2 gap-3">
            <Figure value={stats.onTimePct === null ? "–" : `${stats.onTimePct}%`} label="On time" tone={stats.onTimePct !== null && stats.onTimePct < 70 ? "warn" : undefined} />
            <Figure value={stats.done} label="Finished" />
            <Figure value={stats.late} label="Late" tone={stats.late ? "warn" : undefined} />
            <Figure value={stats.slips} label="Dates moved" />
          </div>
          <a className="link mt-3 inline-block text-[12.5px]" href={`/tasks?owner=${personId}&status=all`}>
            See their tasks
          </a>
        </section>
        <p className="text-[12px] leading-relaxed text-ink-3">1 not done, 2 partly met, 3 met the target, 4 above it, 5 well above. Below 3 for two months running suggests an improvement plan.</p>
      </aside>
    </div>
  );
}
