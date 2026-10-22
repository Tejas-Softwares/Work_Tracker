import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL, PRIORITY_LABEL, type Status, type Priority, isOpen } from "@/lib/domain/tasks";
import { relativeDue, diffDays, formatDate } from "@/lib/domain/dates";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function initialsOf(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "")).toUpperCase();
}

/** Initials in a circle. A seat waiting for a new hire is drawn dashed. */
export function Avatar({ name, size = 24, vacancy = false, title }: { name: string; size?: number; vacancy?: boolean; title?: string }) {
  const fs = size <= 20 ? 9 : size <= 26 ? 10 : size <= 32 ? 12 : 14;
  return (
    <span
      title={title ?? name}
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        vacancy ? "border border-dashed border-line-strong text-ink-3 bg-white" : "bg-brand-wash text-navy",
      )}
      style={{ width: size, height: size, fontSize: fs, letterSpacing: "0.02em" }}
    >
      {vacancy ? "+" : initialsOf(name)}
    </span>
  );
}

const STATUS_STYLE: Record<Status, { dot: string; text: string; bg: string }> = {
  todo: { dot: "var(--color-neutral-mark)", text: "var(--color-ink-2)", bg: "var(--color-wash-2)" },
  in_progress: { dot: "var(--color-phase-b)", text: "var(--color-phase-b)", bg: "var(--color-phase-b-wash)" },
  blocked: { dot: "var(--color-phase-r)", text: "var(--color-phase-r)", bg: "var(--color-phase-r-wash)" },
  done: { dot: "var(--color-earth-mark)", text: "var(--color-earth)", bg: "var(--color-earth-wash)" },
  cancelled: { dot: "var(--color-neutral-mark)", text: "var(--color-ink-3)", bg: "var(--color-wash)" },
};

export function statusColor(s: string): string {
  return (STATUS_STYLE[s as Status] ?? STATUS_STYLE.todo).dot;
}

export function StatusPill({ status, small = false }: { status: string; small?: boolean }) {
  const st = STATUS_STYLE[status as Status] ?? STATUS_STYLE.todo;
  return (
    <span className="chip" style={{ background: st.bg, color: st.text, height: small ? 20 : 22, fontSize: small ? 11.5 : 12 }}>
      <span className="inline-block size-[7px] rounded-full" style={{ background: st.dot }} />
      {STATUS_LABEL[status as Status] ?? status}
    </span>
  );
}

/** Three short bars, like phase indicators: more bars, more urgent. Critical goes red. */
export function PriorityMark({ priority, withLabel = false }: { priority: string; withLabel?: boolean }) {
  const n = priority === "low" ? 1 : priority === "medium" ? 2 : 3;
  const color = priority === "critical" ? "var(--color-phase-r)" : priority === "high" ? "var(--color-phase-y-mark)" : "var(--color-ink-3)";
  return (
    <span className="inline-flex items-center gap-1.5" title={`${PRIORITY_LABEL[priority as Priority] ?? priority} priority`}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block w-[3px] rounded-[1px]" style={{ height: 5 + i * 3, background: i < n ? color : "var(--color-line)" }} />
        ))}
      </span>
      {withLabel ? <span className="text-[12.5px] text-ink-2">{PRIORITY_LABEL[priority as Priority] ?? priority}</span> : <span className="sr-only">{PRIORITY_LABEL[priority as Priority]} priority</span>}
    </span>
  );
}

/** Due date that reads at a glance: late in yellow-phase, due today in navy, done stays quiet. */
export function DueText({ due, status, today }: { due: string | null; status: string; today: string }) {
  if (!due) return <span className="text-ink-3">No date</span>;
  if (!isOpen(status)) return <span className="text-ink-3 num">{formatDate(due, today)}</span>;
  const n = diffDays(today, due);
  const late = n < 0;
  return (
    <span
      className={cx("num whitespace-nowrap", late && "font-semibold", n === 0 && "font-semibold")}
      style={{ color: late ? "var(--color-phase-y)" : n === 0 ? "var(--color-navy)" : "var(--color-ink-2)" }}
      title={formatDate(due, today)}
    >
      {late && <span className="mr-1 inline-block size-[6px] rounded-full align-middle" style={{ background: "var(--color-phase-y-mark)" }} />}
      {relativeDue(due, today)}
    </span>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-[13px] text-ink-3 hover:text-ink">
            ‹ {back.label}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {sub && <div className="mt-1 text-[13.5px] text-ink-2">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[13.5px] text-ink-2">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function DeptChip({ code, name }: { code?: string; name?: string }) {
  if (!code && !name) return null;
  return (
    <span className="chip" title={name} style={{ height: 20, fontSize: 11.5, background: "var(--color-wash)", border: "1px solid var(--color-line)" }}>
      {code || name}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "good"; children: ReactNode }) {
  const c = {
    info: ["var(--color-brand-wash)", "var(--color-brand-line)", "var(--color-navy)"],
    warn: ["var(--color-phase-y-wash)", "#f0d48f", "#6b4a00"],
    danger: ["var(--color-phase-r-wash)", "#efc3bc", "#8a2a1f"],
    good: ["var(--color-earth-wash)", "#b9dcc6", "#1f5a39"],
  }[tone];
  return (
    <div className="rounded-md border px-3.5 py-2.5 text-[13.5px]" style={{ background: c[0], borderColor: c[1], color: c[2] }}>
      {children}
    </div>
  );
}

/** A number with its label underneath, for summary rows. */
export function Figure({ value, label, tone, href }: { value: ReactNode; label: string; tone?: "warn" | "danger" | "good"; href?: string }) {
  const color = tone === "warn" ? "var(--color-phase-y)" : tone === "danger" ? "var(--color-phase-r)" : tone === "good" ? "var(--color-earth)" : "var(--color-ink)";
  const body = (
    <>
      <div className="num text-[24px] font-semibold leading-none" style={{ color, fontStretch: "90%" }}>
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] text-ink-2">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-md px-1 py-0.5 hover:bg-wash">
      {body}
    </Link>
  ) : (
    <div className="px-1 py-0.5">{body}</div>
  );
}

/** A thin bar of parts, e.g. done / in progress / overdue. */
export function SplitBar({ parts, height = 6 }: { parts: { value: number; color: string; label: string }[]; height?: number }) {
  const total = parts.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-wash-2" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {total > 0 && parts.map((p, i) => (p.value ? <span key={i} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null))}
    </div>
  );
}
