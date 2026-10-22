import "server-only";

/**
 * Settings come from environment variables (Vercel: Settings, Environment Variables).
 * Only a database and SETUP_CODE are needed. Everything else is optional or switches a feature on.
 */

/** Finds the database address: DATABASE_URL, POSTGRES_URL, or <PREFIX>_DATABASE_URL from the Vercel Neon integration. */
export function databaseUrl(): string | undefined {
  const e = process.env;
  if (e.DATABASE_URL) return e.DATABASE_URL;
  if (e.POSTGRES_URL) return e.POSTGRES_URL;
  const key = Object.keys(e).find((k) => k.endsWith("_DATABASE_URL") && !k.endsWith("_UNPOOLED_DATABASE_URL") && e[k]);
  return key ? e[key] : undefined;
}

export function setupCode(): string | undefined {
  const v = process.env.SETUP_CODE?.trim();
  return v && v.length >= 8 ? v : undefined;
}

export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || undefined;
}

export type SmtpSettings = { host: string; port: number; user: string; pass: string; from: string };

/** Email is optional. With SMTP_HOST, SMTP_USER and SMTP_PASS set, reminders and digests are emailed. */
export function smtp(): SmtpSettings | undefined {
  const e = process.env;
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASS) return undefined;
  return {
    host: e.SMTP_HOST,
    port: Number(e.SMTP_PORT || 587),
    user: e.SMTP_USER,
    pass: e.SMTP_PASS,
    from: e.SMTP_FROM || e.SMTP_USER,
  };
}

/** The public address of the app, used in email links. */
export function appUrl(): string {
  const e = process.env;
  if (e.APP_URL) return e.APP_URL.replace(/\/$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const isProduction = process.env.NODE_ENV === "production";
