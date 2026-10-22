"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, setupAction, resetAction, recoverAction } from "@/lib/actions/auth";
import { FormError, KeepForm, SubmitButton } from "../ui/client";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <KeepForm action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span className="label">Work email</span>
        <input className="input" name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
        <input type="checkbox" name="remember" defaultChecked className="size-4 accent-brand" /> Keep me signed in on this device
      </label>
      <FormError state={state} />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-[13px] text-ink-2">
        New here? <Link href="/signup" className="link">Ask for access</Link>
        <span className="mx-2 text-line-strong">|</span>
        Forgot your password? Ask an admin for a reset link.
      </p>
    </KeepForm>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signupAction, null);
  return (
    <KeepForm action={action} className="grid gap-4">
      <label className="field">
        <span className="label">Your name</span>
        <input className="input" name="name" autoComplete="name" required autoFocus />
      </label>
      <label className="field">
        <span className="label">Work email</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
        <span className="hint">Use your Tejas email so the admin can match you to the team list.</span>
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <span className="hint">At least 8 characters.</span>
      </label>
      <label className="field">
        <span className="label">Password again</span>
        <input className="input" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <FormError state={state} />
      <SubmitButton pendingText="Sending…">Ask for access</SubmitButton>
      <p className="text-center text-[13px] text-ink-2">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </KeepForm>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupAction, null);
  return (
    <KeepForm action={action} className="grid gap-4">
      <label className="field">
        <span className="label">Setup code</span>
        <input className="input" name="code" type="password" required autoFocus />
        <span className="hint">The SETUP_CODE you typed in Vercel.</span>
      </label>
      <label className="field">
        <span className="label">Your name</span>
        <input className="input" name="name" autoComplete="name" required />
      </label>
      <label className="field">
        <span className="label">Work email</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <FormError state={state} />
      <SubmitButton pendingText="Setting up…">Create the admin account</SubmitButton>
    </KeepForm>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, null);
  return (
    <KeepForm action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span className="label">New password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
      </label>
      <label className="field">
        <span className="label">New password again</span>
        <input className="input" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <FormError state={state} />
      <SubmitButton>Set password and sign in</SubmitButton>
    </KeepForm>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(recoverAction, null);
  return (
    <KeepForm action={action} className="grid gap-4">
      <label className="field">
        <span className="label">Admin email</span>
        <input className="input" name="email" type="email" required autoFocus />
      </label>
      <label className="field">
        <span className="label">Setup code</span>
        <input className="input" name="code" type="password" required />
      </label>
      <label className="field">
        <span className="label">New password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <FormError state={state} />
      <SubmitButton>Set password and sign in</SubmitButton>
    </KeepForm>
  );
}
