"use client";

import { backupNow, runDailyNow, sendTestEmail } from "@/lib/actions/admin";
import { toast, useAction } from "../ui/client";

export function SystemActions({ mail }: { mail: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn" disabled={pending} onClick={() => run(() => backupNow(), { success: "Backup made" })}>
        Make a backup now
      </button>
      <button className="btn" disabled={pending} onClick={() => run(() => runDailyNow(), { onDone: (r) => toast(r.message ?? "Done") })}>
        Run the daily job now
      </button>
      {mail && (
        <button className="btn" disabled={pending} onClick={() => run(() => sendTestEmail(), { onDone: (r) => toast(r.message ?? "Sent") })}>
          Send me a test email
        </button>
      )}
    </div>
  );
}
