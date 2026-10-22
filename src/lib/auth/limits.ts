import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const EMAIL_LIMIT = 5;
const IP_LIMIT = 30;
const LOCK_MIN = 15;

/** Minutes left on a lock, or 0. */
export async function lockedFor(keys: string[]): Promise<number> {
  for (const key of keys) {
    const r = await db().select().from(schema.loginAttempts).where(eq(schema.loginAttempts.key, key)).limit(1);
    const until = r[0]?.lockedUntil;
    if (until && until > new Date()) return Math.ceil((until.getTime() - Date.now()) / 60000);
  }
  return 0;
}

export async function recordFailure(email: string, ip: string): Promise<void> {
  for (const [key, limit] of [[`email:${email}`, EMAIL_LIMIT], [`ip:${ip}`, IP_LIMIT]] as const) {
    const rows = await db()
      .insert(schema.loginAttempts)
      .values({ key, count: 1 })
      .onConflictDoUpdate({
        target: schema.loginAttempts.key,
        set: {
          count: sql`case when ${schema.loginAttempts.lockedUntil} is not null and ${schema.loginAttempts.lockedUntil} < now() then 1 else ${schema.loginAttempts.count} + 1 end`,
          lockedUntil: sql`case when ${schema.loginAttempts.lockedUntil} is not null and ${schema.loginAttempts.lockedUntil} < now() then null else ${schema.loginAttempts.lockedUntil} end`,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (rows[0] && rows[0].count >= limit) {
      await db()
        .update(schema.loginAttempts)
        .set({ lockedUntil: new Date(Date.now() + LOCK_MIN * 60000), count: 0 })
        .where(eq(schema.loginAttempts.key, key));
    }
  }
}

export async function clearFailures(email: string): Promise<void> {
  await db().delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, `email:${email}`));
}
