import { desc, eq } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { timeAgo } from "@/lib/domain/dates";
import { PageHeader, Empty, cx } from "@/components/ui/bits";
import { MarkAllRead, NotificationLink } from "@/components/shell/NotificationBits";

export const metadata = { title: "Notifications" };

const KIND: Record<string, string> = {
  assigned: "Given to you",
  status: "Update",
  comment: "Comment",
  due_changed: "Date moved",
  overdue: "Overdue",
  escalation: "Escalation",
  blocked: "Blocked",
  scorecard: "Scorecard",
  plan: "Improvement plan",
  meeting: "Meeting",
  approval: "Access",
};

export default async function NotificationsPage() {
  const v = await requireViewer();
  const rows = v.personId ? await db().select().from(schema.notifications).where(eq(schema.notifications.personId, v.personId)).orderBy(desc(schema.notifications.createdAt)).limit(150) : [];
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="Notifications" sub={unread ? `${unread} unread` : "All read"} actions={unread ? <MarkAllRead /> : undefined} />
      {rows.length === 0 ? (
        <Empty title="Nothing yet">You&apos;ll hear here when someone gives you a task, comments, moves a date, or when your scorecard is ready.</Empty>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line">
          {rows.map((n) => (
            <li key={n.id} className={cx("border-b border-line last:border-0", !n.readAt && "bg-brand-wash/40")}>
              <NotificationLink id={n.id} href={n.link || "#"} unread={!n.readAt}>
                <span className="flex items-start gap-3 px-4 py-3">
                  <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : n.kind === "escalation" || n.kind === "overdue" ? "bg-phase-y-mark" : "bg-brand")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-[550]">{n.title}</span>
                    {n.body && <span className="block truncate text-[13px] text-ink-2">{n.body}</span>}
                    <span className="mt-0.5 block text-[12px] text-ink-3">
                      {KIND[n.kind] ?? n.kind}, {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </span>
              </NotificationLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

