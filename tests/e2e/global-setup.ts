import pg from "pg";
import { execFileSync } from "node:child_process";

/** Empties the test database and creates the tables, so every run starts from nothing. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/worktracker_test";
  if (!/localhost|127\.0\.0\.1/.test(url) || !/test/.test(url)) throw new Error(`Refusing to wipe ${url}: the e2e database must be local and have "test" in its name.`);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await c.end();
  execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
