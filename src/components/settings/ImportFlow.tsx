"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { previewImport, runImport, type PreviewResult } from "@/lib/actions/admin";
import { FormError } from "../ui/client";
import { Notice } from "../ui/bits";

const ORDER = ["Departments", "People", "KRAs", "KPIs", "Meetings", "Initiatives", "Milestones", "Tasks"];

export function ImportFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runImport>> | null>(null);
  const [pending, start] = useTransition();
  const plan = preview?.ok ? preview.data : null;

  const send = (fn: typeof previewImport | typeof runImport, after: (r: never) => void) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => after((await fn(null, fd)) as never));
  };

  if (result?.ok) {
    const done = result.data!.done;
    return (
      <div className="grid gap-3">
        <Notice tone="good">
          Imported: {ORDER.filter((k) => done[k]).map((k) => `${done[k]} ${k.toLowerCase()}`).join(", ") || "nothing new"}. A backup of everything before the import is in Backups and email.
        </Notice>
        <div className="flex gap-2">
          <Link href="/team" className="btn btn-primary">
            See the team
          </Link>
          <Link href="/settings/access" className="btn">
            Link accounts to names
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <label className="field">
        <span className="label">Workbook (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-[13.5px] file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:font-semibold"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
          }}
        />
      </label>
      <FormError state={preview && !preview.ok ? preview : result && !result.ok ? result : null} />

      {plan && (
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th className="num">New</th>
                  <th className="num">Updated</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.filter((k) => plan.counts[k]).map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="num">{plan.counts[k].add}</td>
                    <td className="num">{plan.counts[k].update}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.errors.length > 0 && (
            <Notice tone="danger">
              <p className="font-semibold">Fix these in the workbook, then check again:</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          {plan.warnings.length > 0 && (
            <Notice tone="warn">
              <p className="font-semibold">Worth a look ({plan.warnings.length}); the import still works:</p>
              <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5">
                {plan.warnings.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {plan && !plan.errors.length ? (
          <button className="btn btn-primary" disabled={pending} onClick={() => send(runImport, (r) => setResult(r))}>
            {pending ? "Importing…" : `Import ${file?.name ?? "the workbook"}`}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!file || pending} onClick={() => send(previewImport, (r) => setPreview(r))}>
            {pending ? "Checking…" : plan ? "Check again" : "Check the workbook"}
          </button>
        )}
      </div>
    </div>
  );
}
