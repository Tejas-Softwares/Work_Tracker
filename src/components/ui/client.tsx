"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cx, Avatar } from "./bits";

const PendingContext = createContext(false);

/**
 * A form that runs a server action without clearing what was typed. (React resets a form after its action
 * finishes; on a validation error that would wipe the person's input.)
 */
export function KeepForm({ action, children, className, clearWhen }: { action: (fd: FormData) => void; children: ReactNode; className?: string; clearWhen?: unknown }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  // clear the fields when the caller says so, e.g. after a password change succeeds
  useEffect(() => {
    if (clearWhen) ref.current?.reset();
  }, [clearWhen]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() => action(fd));
      }}
      aria-busy={pending}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function SubmitButton({ children, className = "btn btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const status = useFormStatus();
  const kept = useContext(PendingContext);
  const pending = status.pending || kept;
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

export function FormError({ state }: { state: { ok: boolean; error?: string; message?: string } | null | undefined }) {
  if (!state) return null;
  if (!state.ok && state.error)
    return (
      <p role="alert" className="rounded-md border border-[#efc3bc] bg-phase-r-wash px-3 py-2 text-[13px] text-[#8a2a1f]">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md border border-[#b9dcc6] bg-earth-wash px-3 py-2 text-[13px] text-[#1f5a39]">
        {state.message}
      </p>
    );
  return null;
}

type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

/** Runs a server action from a click, tracking pending and errors, and shows a toast on failure. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<R extends Result>(fn: () => Promise<R>, opts?: { success?: string; onDone?: (r: Extract<R, { ok: true }>) => void }) {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setError(r.error);
          toast(r.error, "error");
        } else {
          if (opts?.success) toast(opts.success);
          opts?.onDone?.(r as Extract<R, { ok: true }>);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(msg);
        toast(msg, "error");
      }
    });
  }
  return { pending, error, run, setError };
}

// ---------------------------------------------------------------- toasts

type ToastMsg = { id: number; text: string; tone: "info" | "error" };

export function toast(text: string, tone: "info" | "error" = "info") {
  window.dispatchEvent(new CustomEvent("twt-toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; tone: "info" | "error" };
      const id = ++n;
      setItems((s) => [...s.slice(-2), { id, ...d }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), d.tone === "error" ? 6000 : 3200);
    };
    window.addEventListener("twt-toast", onToast);
    return () => window.removeEventListener("twt-toast", onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          data-toast={t.tone}
          className={cx(
            "anim-pop pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-[13.5px] shadow-[var(--shadow-pop)]",
            t.tone === "error" ? "bg-[#8a2a1f] text-white" : "bg-navy text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dialog

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 520,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="anim-pop m-auto max-h-[90dvh] w-[calc(100%-24px)] overflow-visible rounded-lg border border-line bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-[rgb(26_34_56/0.32)]"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- person picker

export type PickPerson = { id: string; name: string; designation?: string; dept?: string; vacancy?: boolean };

/** A searchable list of people. Puts the chosen id in a hidden input when given a name. */
export function PersonPicker({
  people,
  value,
  onChange,
  name,
  placeholder = "Choose a person",
  allowEmpty = false,
  emptyLabel = "No one",
  autoFocus = false,
  compact = false,
  id,
  label,
}: {
  people: PickPerson[];
  value: string | null;
  onChange?: (id: string | null) => void;
  name?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  autoFocus?: boolean;
  compact?: boolean;
  id?: string;
  /** What the picker is for, read out by screen readers. Defaults to the placeholder. */
  label?: string;
}) {
  const [current, setCurrent] = useState<string | null>(value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setCurrent(value);
  }

  const chosen = people.find((p) => p.id === current) ?? null;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? people.filter((p) => p.name.toLowerCase().includes(s) || (p.designation ?? "").toLowerCase().includes(s) || (p.dept ?? "").toLowerCase().includes(s))
      : people;
    return list.slice(0, 60);
  }, [q, people]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(id: string | null) {
    setCurrent(id);
    onChange?.(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrap} className="relative">
      {name && <input type="hidden" name={name} value={current ?? ""} />}
      <div
        className={cx("input flex cursor-text items-center gap-2", compact && "h-[30px] text-[13px]")}
        onClick={() => {
          setOpen(true);
          setTimeout(() => input.current?.focus(), 0);
        }}
      >
        {chosen && !open && <Avatar name={chosen.name} size={20} vacancy={chosen.vacancy} />}
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-label={label ?? placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
          placeholder={chosen ? chosen.name : placeholder}
          value={open ? q : chosen ? chosen.name : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (open && filtered[hi]) {
                e.preventDefault();
                pick(filtered[hi].id);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-[60] mt-1 max-h-72 w-full min-w-[240px] overflow-auto rounded-md border border-line bg-white py-1 shadow-[var(--shadow-pop)]">
          {allowEmpty && (
            <li role="option" aria-selected={!current} className="cursor-pointer px-3 py-1.5 text-[13px] text-ink-2 hover:bg-wash" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>
              {emptyLabel}
            </li>
          )}
          {filtered.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === current}
              className={cx("flex cursor-pointer items-center gap-2 px-3 py-1.5", i === hi && "bg-brand-wash", p.id === current && "font-semibold")}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p.id)}
            >
              <Avatar name={p.name} size={22} vacancy={p.vacancy} />
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.name}</span>
              <span className="truncate text-[12px] text-ink-3">{p.dept || p.designation}</span>
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-2 text-[13px] text-ink-3">No one matches “{q}”.</li>}
        </ul>
      )}
    </div>
  );
}

/** A button that asks before doing something that can't be undone. */
export function ConfirmButton({
  children,
  confirm,
  onConfirm,
  className = "btn btn-danger btn-sm",
  phrase,
}: {
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  className?: string;
  phrase?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Are you sure?"
        width={420}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: "var(--color-phase-r)", borderColor: "var(--color-phase-r)" }}
              disabled={!!phrase && typed !== phrase}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {children}
            </button>
          </>
        }
      >
        <p className="text-[14px] text-ink-2">{confirm}</p>
        {phrase && (
          <label className="field mt-3">
            <span className="label">Type {phrase} to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </label>
        )}
      </Dialog>
    </>
  );
}
