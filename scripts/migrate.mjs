// Brings the database tables up to date. Runs before every build (npm run build), so a push to GitHub
// updates the tables on Vercel. The first deployment comes before a database is connected: it still goes
// live and shows a "Not ready yet" page with the next steps.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const e = process.env;
const key = Object.keys(e).find((k) => k.endsWith("_DATABASE_URL") && !k.endsWith("_UNPOOLED_DATABASE_URL") && e[k]);
// Migrations prefer the direct (unpooled) address when the Neon integration provides one.
const url = e.DATABASE_URL_UNPOOLED || e.POSTGRES_URL_NON_POOLING || e.DATABASE_URL || e.POSTGRES_URL || (key ? e[key] : undefined);

if (!url) {
  console.log(
    e.VERCEL
      ? "No database connected yet. In Vercel, open Storage, connect a Neon database to this project, then redeploy."
      : "No DATABASE_URL, skipping migrations.",
  );
  process.exit(0);
}

const local = /localhost|127\.0\.0\.1/.test(url);
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: local ? undefined : { rejectUnauthorized: true } });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Database tables are up to date.");
} catch (err) {
  console.error("Could not update the database tables:", err);
  process.exit(1);
} finally {
  await pool.end();
}
