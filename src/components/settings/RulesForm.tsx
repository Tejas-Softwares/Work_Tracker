"use client";

import { useActionState } from "react";
import { saveRules } from "@/lib/actions/admin";
import type { AppSettings } from "@/lib/settings";
import { WEEKDAY_NAMES } from "@/lib/domain/dates";
import { FormError, KeepForm, SubmitButton } from "../ui/client";

export function RulesForm({ settings }: { settings: AppSettings }) {
  const [state, action] = useActionState(saveRules, null);
  const r = settings.rules;
  return (
    <KeepForm action={action} className="grid max-w-2xl gap-6">
      <section className="grid gap-3">
        <h2 className="section-title">Company</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="field">
            <span className="label">Legal name</span>
            <input className="input" name="companyName" defaultValue={settings.company.name} />
          </label>
          <label className="field">
            <span className="label">Short name (shown in the menu)</span>
            <input className="input" name="shortName" defaultValue={settings.company.shortName} />
          </label>
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="section-title">Working days</h2>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_NAMES.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-[13.5px]">
              <input type="checkbox" name="workingDays" value={i + 1} defaultChecked={r.workingDays.includes(i + 1)} className="size-4 accent-brand" /> {d}
            </label>
          ))}
        </div>
        <p className="hint">Daily repeating tasks and huddles fall on these days; overdue days and quiet days count only these.</p>
      </section>
      <section className="grid gap-3">
        <h2 className="section-title">Follow-up</h2>
        <label className="field max-w-sm">
          <span className="label">Tell the manager when a task is overdue by (working days)</span>
          <input className="input num" type="number" name="escalateAfterDays" min={1} max={30} defaultValue={r.escalateAfterDays} />
        </label>
        <label className="field max-w-sm">
          <span className="label">Flag someone as quiet after (working days with no work logged)</span>
          <input className="input num" type="number" name="idleAfterDays" min={1} max={30} defaultValue={r.idleAfterDays} />
        </label>
        <label className="field max-w-sm">
          <span className="label">Scorecards are due by this day of the next month</span>
          <input className="input num" type="number" name="scoreByDay" min={1} max={28} defaultValue={r.scoreByDay} />
        </label>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" name="requireSlipReason" defaultChecked={r.requireSlipReason} className="size-4 accent-brand" /> Ask for a reason when someone moves their own due date later (shared with whoever gave the task)
        </label>
      </section>
      <section className="grid gap-3">
        <h2 className="section-title">Email</h2>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" name="dailyDigest" defaultChecked={settings.email.dailyDigest} className="size-4 accent-brand" /> Send each person a morning email with what&apos;s overdue, due today and new for them
        </label>
      </section>
      <FormError state={state} />
      <div>
        <SubmitButton>Save rules</SubmitButton>
      </div>
    </KeepForm>
  );
}
