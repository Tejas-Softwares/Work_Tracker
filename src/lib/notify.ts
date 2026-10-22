import "server-only";
import { db, schema } from "./db";
import { newId } from "./ids";

export type NotificationKind =
  | "assigned"
  | "status"
  | "comment"
  | "due_changed"
  | "overdue"
  | "escalation"
  | "blocked"
  | "scorecard"
  | "plan"
  | "meeting"
  | "approval";

/** In-app notifications (and the next email digest). The person who acted is never told about their own action. */
export async function notify(
  personIds: (string | null | undefined)[],
  n: { kind: NotificationKind; title: string; body?: string; link?: string },
  exceptPersonId?: string | null,
): Promise<void> {
  const ids = [...new Set(personIds.filter((x): x is string => !!x && x !== exceptPersonId))];
  if (!ids.length) return;
  await db()
    .insert(schema.notifications)
    .values(ids.map((personId) => ({ id: newId(), personId, kind: n.kind, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 1000), link: n.link ?? "" })));
}
