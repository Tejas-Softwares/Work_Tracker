"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveKpi, saveKpiValue } from "@/lib/actions/kpis";
import { rag, formatKpi, RAG_LABEL, type Rag } from "@/lib/domain/kpi";
import { monthLabel } from "@/lib/domain/dates";
import { cx } from "../ui/bits";
import { Dialog, PersonPicker, useAction, type PickPerson } from "../ui/client";

export type KpiRow = {
  id: string;
  name: string;
  unit: string;
  target: number | null;
  direction: string;
  owner: string;
  ownerId: string | null;
  description: string;
  active: boolean;
  canEnter: boolean;
  values: Record<string, { value: number; note: string }>;
};

const RAG_COLOR: Record<Rag, string> = { green: "var(--color-earth-mark)", amber: "var(--color-phase-y-mark)", red: "var(--color-phase-r)" };

function Cell({ row, month, editable }: { row: KpiRow; month: string; editable: boolean }) {
  const v = row.values[month];
  const [text, setText] = useState(v ? String(v.value) : "");
  const { pending, run } = useAction();
  const status = v ? rag(v.value, row.target, row.direction) : null;
  if (!editable) {
    return (
      <span className="inline-flex items-center justify-end gap-1.5" title={status ? RAG_LABEL[status] : undefined}>
        {status && <span className="inline-block size-2 rounded-full" style={{ background: RAG_COLOR[status] }} aria-hidden="true" />}
        <span className={cx("num", !v && "text-ink-3")}>{v ? formatKpi(v.value, row.unit) : "–"}</span>
        {status && status !== "green" && <span className="sr-only">{RAG_LABEL[status]}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {status && <span className="inline-block size-2 rounded-full" style={{ background: RAG_COLOR[status] }} title={RAG_LABEL[status]} />}
      <input
        className="input num text-right"
        style={{ height: 30, width: 84, opacity: pending ? 0.6 : 1 }}
        inputMode="decimal"
        value={text}
        placeholder="enter"
        aria-label={`${row.name}, ${monthLabel(month)}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === (v ? String(v.value) : "")) return;
          run(() => saveKpiValue(row.id, month, text, v?.note ?? ""), { success: text ? "Saved" : "Cleared" });
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </span>
  );
}

export function KpiTable({ deptId, deptName, head, months, rows, canEdit, people, compact = false }: { deptId: string; deptName: string; head: string; months: string[]; rows: KpiRow[]; canEdit: boolean; people: PickPerson[]; compact?: boolean }) {
  const [editing, setEditing] = useState<Partial<KpiRow> | null>(null);
  if (compact)
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13.5px]">{deptName}</span>
        <button className="btn btn-sm" onClick={() => setEditing({ direction: "higher", unit: "%" })}>
          <Plus size={14} /> Add KPI
        </button>
        <KpiDialog deptId={deptId} kpi={editing} onClose={() => setEditing(null)} people={people} />
      </div>
    );
  const current = months[months.length - 1];
  const visible = rows.filter((r) => r.active);
  const onTarget = visible.filter((r) => {
    const v = r.values[current];
    return v && rag(v.value, r.target, r.direction) === "green";
  }).length;
  const entered = visible.filter((r) => r.values[current]).length;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">
          {deptName} <span className="text-[13px] font-normal text-ink-3">{head ? `head: ${head}` : ""}</span>
        </h2>
        <div className="flex items-center gap-3 text-[12.5px] text-ink-2">
          <span>
            {entered} of {visible.length} entered for {monthLabel(current)}
            {entered ? `, ${onTarget} on target` : ""}
          </span>
          {canEdit && (
            <button className="btn btn-sm" onClick={() => setEditing({ direction: "higher", unit: "%" })}>
              <Plus size={14} /> Add KPI
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table min-w-[860px] table-fixed">
          <colgroup>
            <col />
            <col style={{ width: 128 }} />
            {months.map((m, i) => (
              <col key={m} style={{ width: i >= months.length - 2 && rows.some((r) => r.canEnter) ? 124 : 64 }} />
            ))}
            {canEdit && <col style={{ width: 48 }} />}
          </colgroup>
          <thead>
            <tr>
              <th>KPI</th>
              <th className="num text-right">Target</th>
              {months.map((m) => (
                <th key={m} className={cx("num text-right", m === current && "text-navy")}>
                  {monthLabel(m).replace(/ \d{4}$/, "")}
                </th>
              ))}
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="font-[550]">{r.name}</div>
                  <div className="text-[12px] text-ink-3">
                    {r.owner && `${r.owner}. `}
                    {r.direction === "lower" ? "Lower is better" : "Higher is better"}
                    {r.description ? `. ${r.description}` : ""}
                  </div>
                </td>
                <td className="num text-right whitespace-nowrap">{r.target === null ? <span className="text-ink-3">set after baseline</span> : `${r.direction === "lower" ? "≤" : "≥"} ${formatKpi(r.target, r.unit)}`}</td>
                {months.map((m) => (
                  <td key={m} className={cx("text-right", m === current && "bg-brand-wash/40")}>
                    <Cell row={r} month={m} editable={r.canEnter && (m === current || m === months[months.length - 2])} />
                  </td>
                ))}
                {canEdit && (
                  <td className="text-right">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                      <Pencil size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={months.length + 3} className="py-6 text-center text-[13.5px] text-ink-3">
                  No KPIs for {deptName} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <KpiDialog deptId={deptId} kpi={editing} onClose={() => setEditing(null)} people={people} />
    </section>
  );
}

function KpiDialog({ deptId, kpi, onClose, people }: { deptId: string; kpi: Partial<KpiRow> | null; onClose: () => void; people: PickPerson[] }) {
  const [form, setForm] = useState<Partial<KpiRow>>({});
  const [target, setTarget] = useState("");
  const { pending, run } = useAction();
  const open = !!kpi;
  const f = { ...kpi, ...form };
  return (
    <Dialog
      open={open}
      onClose={() => {
        setForm({});
        setTarget("");
        onClose();
      }}
      title={kpi?.id ? "Edit KPI" : "Add KPI"}
      footer={
        <>
          {kpi?.id && (
            <button className="btn mr-auto" onClick={() => run(() => saveKpi({ id: kpi.id, departmentId: deptId, name: f.name ?? "", unit: f.unit ?? "", target: target || (f.target ?? "").toString(), direction: f.direction ?? "higher", ownerPersonId: f.ownerId ?? null, description: f.description ?? "", active: false }), { success: "KPI retired", onDone: onClose })}>
              Retire KPI
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              run(() => saveKpi({ id: kpi?.id, departmentId: deptId, name: f.name ?? "", unit: f.unit ?? "", target: target !== "" ? target : f.target === null || f.target === undefined ? "" : String(f.target), direction: f.direction ?? "higher", ownerPersonId: f.ownerId ?? null, description: f.description ?? "" }), {
                success: "Saved",
                onDone: () => {
                  setForm({});
                  setTarget("");
                  onClose();
                },
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      {open && (
        <div className="grid gap-3">
          <label className="field">
            <span className="label">KPI</span>
            <input className="input" defaultValue={kpi?.name ?? ""} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. RA bills within 5 working days" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span className="label">Target</span>
              <input className="input num" defaultValue={kpi?.target ?? ""} onChange={(e) => setTarget(e.target.value)} placeholder="empty = set later" />
            </label>
            <label className="field">
              <span className="label">Unit</span>
              <input className="input" defaultValue={kpi?.unit ?? ""} onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))} placeholder="%, days, ₹ lakh" />
            </label>
            <label className="field">
              <span className="label">Better when</span>
              <select className="select" defaultValue={kpi?.direction ?? "higher"} onChange={(e) => setForm((s) => ({ ...s, direction: e.target.value }))}>
                <option value="higher">Higher</option>
                <option value="lower">Lower</option>
              </select>
            </label>
          </div>
          <div className="field">
            <span className="label">Owner</span>
            <PersonPicker people={people} value={kpi?.ownerId ?? null} allowEmpty emptyLabel="The department head" onChange={(id) => setForm((s) => ({ ...s, ownerId: id }))} />
          </div>
          <label className="field">
            <span className="label">Notes</span>
            <input className="input" defaultValue={kpi?.description ?? ""} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} placeholder="How it is counted" />
          </label>
        </div>
      )}
    </Dialog>
  );
}
