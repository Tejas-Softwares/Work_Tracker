import "server-only";
import { cache } from "react";
import { db, schema } from "./db";
import { DEFAULT_WORKING_DAYS } from "./domain/dates";

export type AppSettings = {
  company: { name: string; shortName: string };
  rules: {
    /** 1 = Monday … 7 = Sunday */
    workingDays: number[];
    /** Overdue this many working days: the owner's manager is told. */
    escalateAfterDays: number;
    /** No work logged for this many working days: flagged on the dashboard. */
    idleAfterDays: number;
    /** Scorecards for a month are due by this day of the next month. */
    scoreByDay: number;
    /** Ask for a reason when someone moves their own due date later. */
    requireSlipReason: boolean;
  };
  email: { dailyDigest: boolean };
};

export const DEFAULT_SETTINGS: AppSettings = {
  company: { name: "Tejash Electricals Project Pvt. Ltd.", shortName: "Tejas Group" },
  rules: { workingDays: DEFAULT_WORKING_DAYS, escalateAfterDays: 2, idleAfterDays: 3, scoreByDay: 7, requireSlipReason: true },
  email: { dailyDigest: true },
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db().select().from(schema.settings);
  const map = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));
  return {
    company: { ...DEFAULT_SETTINGS.company, ...(map.get("company") ?? {}) },
    rules: { ...DEFAULT_SETTINGS.rules, ...(map.get("rules") ?? {}) },
    email: { ...DEFAULT_SETTINGS.email, ...(map.get("email") ?? {}) },
  } as AppSettings;
});

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await db()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

export async function getMeta(key: string): Promise<unknown> {
  const { eq } = await import("drizzle-orm");
  const r = await db().select().from(schema.settings).where(eq(schema.settings.key, `meta:${key}`)).limit(1);
  return r[0]?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db()
    .insert(schema.settings)
    .values({ key: `meta:${key}`, value: value as object })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as object, updatedAt: new Date() } });
}
