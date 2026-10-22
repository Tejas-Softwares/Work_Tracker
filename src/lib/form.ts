import "server-only";

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string; field?: string };

export function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optStr(fd: FormData, key: string, max = 2000): string | null {
  const s = str(fd, key, max);
  return s ? s : null;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string): number | null {
  const s = str(fd, key, 20);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((x): x is string => typeof x === "string" && x.length > 0);
}

export function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** Errors thrown inside actions become a friendly message. */
export function fail(e: unknown): { ok: false; error: string } {
  if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "NO_DATABASE") return { ok: false, error: "The database is not connected yet." };
  console.error(e);
  return { ok: false, error: msg.length < 200 && !/syntax|relation|column|violates/i.test(msg) ? msg : "Something went wrong. Try again." };
}
