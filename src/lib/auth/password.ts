import "server-only";
import { scrypt as _scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, KEYLEN = 64;

/** scrypt$N$r$p$salt$hash, all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("base64url");
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "Use at most 200 characters.";
  if (/^(.)\1+$/.test(pw) || ["password", "12345678", "tejas123", "qwertyui"].includes(pw.toLowerCase())) return "Choose a less common password.";
  return null;
}

/** Equal-time comparison for codes such as SETUP_CODE. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}
