"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/lib/actions/admin";
import { FormError, KeepForm, SubmitButton } from "../ui/client";

export function AccountForms({ name, phone, linked }: { name: string; phone: string; linked: boolean }) {
  const [p, profileAction] = useActionState(updateProfile, null);
  const [pw, passwordAction] = useActionState(changePassword, null);
  return (
    <div className="grid gap-8">
      <KeepForm action={profileAction} className="grid gap-3">
        <h2 className="section-title">Details</h2>
        <label className="field">
          <span className="label">Name</span>
          <input className="input" name="name" defaultValue={name} required />
        </label>
        {linked && (
          <label className="field">
            <span className="label">Mobile</span>
            <input className="input" name="phone" defaultValue={phone} inputMode="tel" />
          </label>
        )}
        <FormError state={p} />
        <div>
          <SubmitButton>Save</SubmitButton>
        </div>
      </KeepForm>
      <KeepForm action={passwordAction} className="grid gap-3" clearWhen={pw?.ok ? pw : null}>
        <h2 className="section-title">Password</h2>
        <label className="field">
          <span className="label">Current password</span>
          <input className="input" name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="field">
          <span className="label">New password</span>
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span className="label">New password again</span>
          <input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <FormError state={pw} />
        <div>
          <SubmitButton>Change password</SubmitButton>
        </div>
      </KeepForm>
    </div>
  );
}
