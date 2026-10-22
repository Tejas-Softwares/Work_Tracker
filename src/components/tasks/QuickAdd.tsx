"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseQuickAdd } from "@/lib/domain/quickadd";
import { describeRule, PRIORITIES, PRIORITY_LABEL, SOURCES, SOURCE_LABEL, firstOccurrence } from "@/lib/domain/tasks";
import { formatDay, WEEKDAY_NAMES } from "@/lib/domain/dates";
import type { RecurrenceRule } from "@/lib/db/schema";
import { createTask } from "@/lib/actions/tasks";
import { Dialog, PersonPicker, toast, useAction, type PickPerson } from "../ui/client";
import { cx } from "../ui/bits";

export type QuickAddDefaults = {
  ownerId?: string | null;
  meetingId?: string | null;
  initiativeId?: string | null;
  milestoneId?: string | null;
  source?: string;
  project?: string;
  title?: string;
  context?: string;
};

/** Open the quick-add box from anywhere, optionally with defaults (a meeting, an initiative, an owner). */
export function openQuickAdd(defaults: QuickAddDefaults = {}) {
  window.dispatchEvent(new CustomEvent("twt-quickadd", { detail: defaults }));
}

type Props = {
  people: PickPerson[];
  me: string | null;
  today: string;
  workingDays: number[];
  initiatives: { id: string; name: string }[];
  projects: string[];
};

export function QuickAdd({ people, me, today, workingDays, initiatives, projects }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<QuickAddDefaults>({});
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  // manual overrides; undefined = follow what the text says
  const [ownerOverride, setOwnerOverride] = useState<string | null | undefined>(undefined);
  const [dueOverride, setDueOverride] = useState<string | undefined>(undefined);
  const [prioOverride, setPrioOverride] = useState<string | undefined>(undefined);
  const [projectOverride, setProjectOverride] = useState<string | undefined>(undefined);
  const [repeatOverride, setRepeatOverride] = useState<RecurrenceRule | null | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<string>("");
  const [initiativeId, setInitiativeId] = useState<string>("");
  const [checks, setChecks] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as QuickAddDefaults;
      setDefaults(d);
      setText(d.title ?? "");
      setOwnerOverride(d.ownerId === undefined ? undefined : d.ownerId);
      setDueOverride(undefined);
      setPrioOverride(undefined);
      setProjectOverride(d.project);
      setRepeatOverride(undefined);
      setDescription("");
      setSource(d.source ?? "");
      setInitiativeId(d.initiativeId ?? "");
      setChecks("");
      setMore(false);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 30);
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener("twt-quickadd", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("twt-quickadd", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const parsed = useMemo(() => parseQuickAdd(text, { today, people: people.filter((p) => !p.vacancy), workingDays }), [text, today, people, workingDays]);
  const ownerId = ownerOverride !== undefined ? ownerOverride : parsed.owner?.id ?? defaults.ownerId ?? me;
  const rule = repeatOverride !== undefined ? repeatOverride : parsed.rule ?? null;
  const due = dueOverride !== undefined ? dueOverride || null : parsed.due ?? (rule ? firstOccurrence(rule, today, workingDays) : null);
  const priority = prioOverride ?? parsed.priority ?? "medium";
  const project = projectOverride ?? parsed.project ?? "";
  const owner = people.find((p) => p.id === ownerId);

  function submit(openAfter: boolean) {
    const title = parsed.title || text.trim();
    if (!title) {
      toast("Type what needs doing first.", "error");
      return;
    }
    run(
      () =>
        createTask({
          title,
          description,
          ownerId,
          dueDate: due,
          priority,
          project,
          source: source || undefined,
          initiativeId: initiativeId || defaults.initiativeId || null,
          milestoneId: defaults.milestoneId ?? null,
          meetingId: defaults.meetingId ?? null,
          rule,
          checks: checks.split("\n"),
        }),
      {
        onDone: (r) => {
          const n = (r.data as { number: number }).number;
          toast(`Added T-${n}${owner && owner.id !== me ? ` for ${owner.name}` : ""}`);
          if (openAfter) {
            setOpen(false);
            router.push(`/tasks?open=${n}`);
          } else {
            setText("");
            setOwnerOverride(defaults.ownerId === undefined ? undefined : defaults.ownerId);
            setDueOverride(undefined);
            setPrioOverride(undefined);
            setRepeatOverride(undefined);
            setDescription("");
            setChecks("");
            inputRef.current?.focus();
          }
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={defaults.context ? `New task: ${defaults.context}` : "New task"}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={() => submit(true)} disabled={pending}>
            Add and open
          </button>
          <button type="button" className="btn btn-primary" onClick={() => submit(false)} disabled={pending}>
            {pending ? "Adding…" : "Add task"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <label className="sr-only" htmlFor="qa-text">
          What needs doing
        </label>
        <input
          id="qa-text"
          ref={inputRef}
          className="input"
          style={{ height: 44, fontSize: 16 }}
          placeholder="e.g. Send RA bill to Jabil @Ravi #Jabil !high fri"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1.5 text-[12px] text-ink-3">
          <b className="font-semibold text-ink-2">@name</b> owner, <b className="font-semibold text-ink-2">#tag</b> project, <b className="font-semibold text-ink-2">!high</b> or <b className="font-semibold text-ink-2">!!</b> priority,{" "}
          <b className="font-semibold text-ink-2">today, fri, 25 Oct, in 3 days</b> due, <b className="font-semibold text-ink-2">every monday</b> repeats. Press Enter to add.
        </p>
        {parsed.ownerOptions && !ownerOverride && (
          <p className="mt-2 text-[12.5px] text-phase-y">
            “@{parsed.ownerQuery}” could be {parsed.ownerOptions.map((p) => p.name).join(", ")}. Pick the owner below.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="field">
            <span className="label">Owner</span>
            <PersonPicker people={people} value={ownerId ?? null} onChange={(id) => setOwnerOverride(id)} placeholder="Who owns it" label="Owner" />
          </div>
          <div className="field">
            <span className="label">Due</span>
            <div className="flex items-center gap-2">
              <input type="date" className="input" value={due ?? ""} onChange={(e) => setDueOverride(e.target.value)} />
            </div>
            {due && <span className="hint">{formatDay(due, today)}</span>}
          </div>
          <div className="field">
            <span className="label">Priority</span>
            <select className="select" value={priority} onChange={(e) => setPrioOverride(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Project or site</span>
            <input className="input" list="qa-projects" value={project} onChange={(e) => setProjectOverride(e.target.value)} placeholder="e.g. Ather, Jabil B-1700" />
            <datalist id="qa-projects">
              {projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="field sm:col-span-2">
            <span className="label">Repeats</span>
            <RepeatPicker value={rule} onChange={setRepeatOverride} />
            {rule && <span className="hint">{describeRule(rule)}. A new task appears for each date; finishing one doesn&apos;t stop the rest.</span>}
          </div>
        </div>

        <button type="button" className="link mt-4 text-[13px]" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          {more ? "Fewer details" : "More details: notes, steps, where it came from"}
        </button>
        {more && (
          <div className="mt-3 grid gap-3">
            <label className="field">
              <span className="label">Notes</span>
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What done looks like, documents to use, who to call" />
            </label>
            <label className="field">
              <span className="label">Steps (one per line)</span>
              <textarea className="textarea" value={checks} onChange={(e) => setChecks(e.target.value)} placeholder={"Collect site measurement\nCheck against BOQ\nSend to client"} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span className="label">Where it came from</span>
                <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">{ownerId === me ? "Own work" : "Director's instruction"}</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Part of an initiative</span>
                <select className="select" value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
                  <option value="">None</option>
                  {initiatives.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function RepeatPicker({ value, onChange }: { value: RecurrenceRule | null; onChange: (r: RecurrenceRule | null) => void }) {
  const type = value?.type ?? "none";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["none", "daily", "weekly", "monthly"] as const).map((t) => (
        <button
          key={t}
          type="button"
          className={cx("btn btn-sm", type === t && "border-brand bg-brand-wash text-navy")}
          aria-pressed={type === t}
          onClick={() =>
            onChange(t === "none" ? null : t === "daily" ? { type: "daily" } : t === "weekly" ? { type: "weekly", dow: value?.type === "weekly" ? value.dow : 1 } : { type: "monthly", dom: value?.type === "monthly" ? value.dom : 5 })
          }
        >
          {t === "none" ? "Doesn't repeat" : t === "daily" ? "Every working day" : t === "weekly" ? "Weekly" : "Monthly"}
        </button>
      ))}
      {value?.type === "weekly" && (
        <select className="select" style={{ width: 150, height: 28 }} value={value.dow} onChange={(e) => onChange({ type: "weekly", dow: Number(e.target.value) })} aria-label="Day of the week">
          {WEEKDAY_NAMES.map((d, i) => (
            <option key={d} value={i + 1}>
              on {d}
            </option>
          ))}
        </select>
      )}
      {value?.type === "monthly" && (
        <select className="select" style={{ width: 150, height: 28 }} value={value.dom} onChange={(e) => onChange({ type: "monthly", dom: Number(e.target.value) })} aria-label="Day of the month">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d === 31 ? "on the last day" : `on day ${d}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
