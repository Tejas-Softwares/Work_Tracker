import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseUrl } from "../env";

export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __twtPool?: Pool; __twtDb?: DB };

export function hasDatabase(): boolean {
  return Boolean(databaseUrl());
}

/** One small pool per server instance. Neon's pooled address handles many short connections well. */
export function db(): DB {
  if (g.__twtDb) return g.__twtDb;
  const url = databaseUrl();
  if (!url) throw new Error("NO_DATABASE");
  const local = /localhost|127\.0\.0\.1/.test(url);
  g.__twtPool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: local ? undefined : { rejectUnauthorized: true },
  });
  g.__twtDb = drizzle(g.__twtPool, { schema });
  return g.__twtDb;
}

export { schema };
