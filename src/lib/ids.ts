import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijkmnpqrstuvwxyz";

/** A short random id, e.g. "k3x9q2mw7p1d". 12 characters from 34 symbols is about 61 bits. */
export function newId(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
