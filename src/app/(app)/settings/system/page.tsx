import { listBackups } from "@/lib/backup";
import { mailEnabled } from "@/lib/mail";
import { getMeta } from "@/lib/settings";
import { cronSecret } from "@/lib/env";
import { formatDateTime } from "@/lib/domain/dates";
import { Notice } from "@/components/ui/bits";
import { SystemActions } from "@/components/settings/SystemActions";

export const metadata = { title: "Backups and email" };

export default async function SystemPage() {
  const [backups, daily, digest] = await Promise.all([listBackups(), getMeta("daily"), getMeta("digest-result")]);
  const last = (daily as { date?: string } | undefined)?.date;
  const d = digest as { date?: string; sent?: number; failed?: number } | undefined;
  return (
    <div className="grid max-w-3xl gap-6">
      <section className="grid gap-2">
        <h2 className="section-title">Daily job</h2>
        <p className="text-[13.5px] text-ink-2">
          Once a day it makes the next repeating tasks, tells managers about tasks overdue past the limit, sends scorecard and check-in reminders, takes a backup and sends the morning emails. It runs from Vercel at about 7:30 am India time, and again on the first visit of the day if that was missed.
        </p>
        <p className="text-[13.5px]">Last run: {last ?? "not yet"}.</p>
        {!cronSecret() && <Notice tone="warn">CRON_SECRET is not set in Vercel, so the scheduled run is refused. The first visit of each day still runs it.</Notice>}
      </section>
      <section className="grid gap-2">
        <h2 className="section-title">Email</h2>
        {mailEnabled() ? (
          <p className="text-[13.5px] text-ink-2">Email is set up.{d?.date ? ` Morning emails on ${d.date}: ${d.sent} sent${d.failed ? `, ${d.failed} failed` : ""}.` : ""}</p>
        ) : (
          <Notice>Email is off. To send morning emails, add SMTP_HOST (smtp.office365.com), SMTP_PORT (587), SMTP_USER and SMTP_PASS in Vercel. Everything else works without it.</Notice>
        )}
      </section>
      <SystemActions mail={mailEnabled()} />
      <section>
        <h2 className="section-title mb-2">Backups</h2>
        <p className="mb-2 text-[13px] text-ink-2">A copy of everything except passwords, taken every night (30 kept) and before every import (20 kept). Download one to keep it outside the app.</p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Taken</th>
                <th>Kind</th>
                <th className="num">Tasks</th>
                <th className="num">Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td className="text-[13px]">{formatDateTime(b.createdAt)}</td>
                  <td className="text-[13px]">{b.kind === "nightly" ? "Nightly" : "Manual"}</td>
                  <td className="num text-[13px]">{b.counts.tasks ?? 0}</td>
                  <td className="num text-[13px]">{Math.round(b.sizeBytes / 1024)} KB</td>
                  <td className="text-right">
                    <a className="btn btn-sm" href={`/api/backup/${b.id}`}>
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {!backups.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-3">
                    No backups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
