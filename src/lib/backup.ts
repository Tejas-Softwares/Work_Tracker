import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { newId } from "./ids";

/** Every table except sign-in secrets. Passwords, sessions and reset links are never in a backup. */
const TABLES = {
  departments: schema.departments,
  people: schema.people,
  kras: schema.kras,
  initiatives: schema.initiatives,
  milestones: schema.milestones,
  taskSeries: schema.taskSeries,
  tasks: schema.tasks,
  taskChecks: schema.taskChecks,
  taskWatchers: schema.taskWatchers,
  taskUpdates: schema.taskUpdates,
  meetingRhythm: schema.meetingRhythm,
  meetings: schema.meetings,
  scorecards: schema.scorecards,
  improvementPlans: schema.improvementPlans,
  planCheckins: schema.planCheckins,
  kpis: schema.kpis,
  kpiValues: schema.kpiValues,
  settings: schema.settings,
} as const;

export async function snapshot(): Promise<{ json: string; counts: Record<string, number> }> {
  const out: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    const rows = await db().select().from(table);
    out[name] = rows;
    counts[name] = rows.length;
  }
  const users = await db()
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, status: schema.users.status, personId: schema.users.personId, createdAt: schema.users.createdAt })
    .from(schema.users);
  out.users = users;
  counts.users = users.length;
  return { json: JSON.stringify({ app: "tejas-work-tracker", version: 1, takenAt: new Date().toISOString(), data: out }), counts };
}

export async function makeBackup(kind: "nightly" | "manual", createdBy: string | null = null): Promise<string> {
  const { json, counts } = await snapshot();
  const id = newId();
  await db().insert(schema.backups).values({ id, kind, data: json, sizeBytes: Buffer.byteLength(json), counts, createdBy });
  // keep the last 30 nightly and 20 manual backups
  for (const [k, keep] of [["nightly", 30], ["manual", 20]] as const) {
    const old = await db().select({ id: schema.backups.id }).from(schema.backups).where(eq(schema.backups.kind, k)).orderBy(desc(schema.backups.createdAt)).offset(keep);
    if (old.length) await db().delete(schema.backups).where(inArray(schema.backups.id, old.map((r) => r.id)));
  }
  return id;
}

export async function listBackups() {
  return db()
    .select({ id: schema.backups.id, kind: schema.backups.kind, sizeBytes: schema.backups.sizeBytes, counts: schema.backups.counts, createdAt: schema.backups.createdAt })
    .from(schema.backups)
    .orderBy(desc(schema.backups.createdAt))
    .limit(60);
}

