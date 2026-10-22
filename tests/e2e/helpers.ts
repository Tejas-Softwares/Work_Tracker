import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

export const DB_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/worktracker_test";
export const PASSWORD = "Tejas#Works2026";

let client: pg.Client | null = null;
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!client) {
    client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
  }
  return (await client.query(text, params)).rows as T[];
}
export async function closeDb() {
  await client?.end();
  client = null;
}

export function istToday(offset = 0): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export type Session = { ctx: BrowserContext; page: Page; errors: string[] };

/** A separate browser for one person, collecting any browser errors. */
export async function openSession(browser: Browser, opts: { mobile?: boolean } = {}): Promise<Session> {
  const ctx = await browser.newContext(opts.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return { ctx, page, errors };
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.locator("input[name=confirm]").fill(PASSWORD);
  await page.getByRole("button", { name: "Ask for access" }).click();
  await expect(page).toHaveURL(/\/pending/);
}

/** Opens the New task box with N and adds a task from one line. Returns its number. */
export function istWeekday(): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date());
}

export async function quickAdd(page: Page, line: string): Promise<number> {
  const panel = page.getByRole("dialog", { name: "Task" });
  if (await panel.isVisible()) {
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
  await page.getByRole("button", { name: /^New task/ }).filter({ visible: true }).first().click();
  const box = page.getByLabel("What needs doing");
  await expect(box).toBeVisible();
  await box.fill(line);
  const seen = await page.locator("[data-toast]").allTextContents();
  const before = Math.max(0, ...seen.map((t) => Number(t.match(/Added T-(\d+)/)?.[1] ?? 0)));
  await box.press("Enter");
  let n = 0;
  await expect(async () => {
    const now = await page.locator("[data-toast]").allTextContents();
    n = Math.max(0, ...now.map((t) => Number(t.match(/Added T-(\d+)/)?.[1] ?? 0)));
    expect(n).toBeGreaterThan(before);
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  return n;
}

export async function personId(name: string): Promise<string> {
  const r = await sql<{ id: string }>("select id from people where name = $1", [name]);
  if (!r[0]) throw new Error(`No person ${name}`);
  return r[0].id;
}

export async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `page is ${over}px wider than the screen`).toBeLessThanOrEqual(1);
}

/** Waits for a toast message (the short note that appears after an action). */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-toast]").filter({ hasText: text }).last()).toBeVisible();
}
