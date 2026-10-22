import "server-only";
import { db, schema } from "./db";
import { newId } from "./ids";
import type { Viewer } from "./auth/session";

export async function logActivity(
  v: Pick<Viewer, "userId" | "name"> | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db().insert(schema.activity).values({
    id: newId(),
    actorUserId: v?.userId ?? null,
    actorName: v?.name ?? "System",
    action,
    entity,
    entityId,
    summary: summary.slice(0, 500),
    data: data ?? null,
  });
}
