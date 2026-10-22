import "server-only";
import nodemailer from "nodemailer";
import { smtp } from "./env";

export function mailEnabled(): boolean {
  return !!smtp();
}

/** Sends one email through the configured SMTP account (Microsoft 365: smtp.office365.com, port 587). */
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  const s = smtp();
  if (!s) throw new Error("Email is not set up.");
  const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: { user: s.user, pass: s.pass }, requireTLS: s.port === 587 });
  await t.sendMail({ from: s.from, to, subject, html, text });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
