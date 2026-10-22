# Developer handover

Everything a developer needs to run, change and look after the Tejas Work Tracker. For deployment see `SETUP.md`; for how the office uses it see `TEAM-GUIDE.md`.

## Stack

| Part | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, server actions) | Read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`). Request interception is `src/proxy.ts`, not `middleware.ts`. |
| UI | React 19.3, Tailwind 4 | Design tokens in `src/app/globals.css` (`@theme`). Font: Archivo, self-hosted in `public/fonts`. |
| Database | Postgres (Neon, Singapore) via Drizzle ORM 0.45 and `pg` | Schema in `src/lib/db/schema.ts`, migrations in `drizzle/`. |
| Excel | ExcelJS | Team workbook import/export and reports. |
| Email | nodemailer over SMTP | Optional. Off unless `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` are set. |
| Hosting | Vercel (region `sin1`) | One cron in `vercel.json`. |
| Tests | Vitest (unit), Playwright (end-to-end) | |

Node 20.9 or later.

## Running it locally

```bash
npm install
createdb worktracker                         # any local Postgres
cp .env.example .env.local                   # set DATABASE_URL, SETUP_CODE, CRON_SECRET
npm run db:migrate
npm run dev                                  # http://localhost:3000 opens /setup the first time
```

Then import `tests/fixtures/Sample_Team_Structure.xlsx` (made-up names) under Settings, Import team. `node tests/fixtures/demo-activity.mjs` fills a local database with eight weeks of made-up activity so the dashboard has something to show. It refuses to run against a non-local database.

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Runs migrations (`scripts/migrate.mjs`), then `next build` |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | 34 unit tests on the business rules |
| `npm run test:e2e` | 19 browser tests against a production build (see Tests) |
| `npm run db:generate` | New migration from schema changes |
| `npm run db:migrate` | Apply migrations |

## Environment variables

| Name | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres address. `POSTGRES_URL` or any `<PREFIX>_DATABASE_URL` from the Vercel Neon integration also works (`src/lib/env.ts`). Migrations prefer the unpooled address when present. |
| `SETUP_CODE` | Yes | 8+ characters. Creates the first admin at `/setup`; lets an admin reset their own password at `/recover`. |
| `CRON_SECRET` | Yes on Vercel | Vercel sends it as `Authorization: Bearer …` to `/api/cron/daily`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Morning digest and test email. Port defaults to 587, from defaults to the user. |
| `APP_URL` | No | Public address for links in emails. Falls back to Vercel's production URL. |

With no database the app still builds and every page redirects to `/not-ready`, which explains the next step. That is how the first deploy behaves.

## How the code is organised

```
src/
  proxy.ts               sign-in redirect for requests without a session cookie; CSP nonce
  app/
    (auth)/              login, signup, setup, pending, reset/[token], recover, not-ready
    (app)/               every signed-in page; layout.tsx loads the viewer and kicks the daily job
    api/                 cron/daily, structure (team workbook), backup/[id], export/{tasks,scorecards,kpis,weekly}
  components/            UI by area: ui/ (shared bits, forms, dialogs, toasts), shell/, tasks/, charts/, org/,
                         scores/, kpis/, meetings/, initiatives/, plans/, settings/, auth/
  lib/
    domain/              pure functions, no database: dates, tasks (status, overdue, on-time, recurrence),
                         quickadd (one-line parser), scoring, kpi, muster
    auth/                password hashing, sessions, sign-in limits
    org.ts               the reporting tree and every "who may see/do this" rule
    data/                read queries, always filtered by what the viewer may see
    actions/             server actions: every write, each starting with a permission check
    excel/               team workbook (structure.ts) and report workbooks (reports.ts)
    jobs/daily.ts        the daily job
    settings.ts          rules stored in the settings table, with defaults
    activity.ts, notify.ts, backup.ts, mail.ts, form.ts, env.ts, ids.ts
```

Pattern used everywhere: a page (server component) loads data through `lib/data`, passes plain objects to client components, and those call server actions in `lib/actions`. Actions return `{ ok, error?, message? }` (`lib/form.ts`) and call `refresh()` so the page re-renders with fresh data. Forms that must keep their values after a failed action use `KeepForm` from `components/ui/client.tsx`, because React 19 resets forms after an action.

The root layout sets `export const dynamic = "force-dynamic"`: every page depends on the signed-in person and the database, so nothing is prerendered.

## Data model

25 tables. The ones that matter most:

| Table | Holds |
| --- | --- |
| `departments` | Name, head, director, sort order |
| `people` | Every seat in the organisation, filled or vacant (`is_vacancy`), with `reports_to`, department, designation, role card (purpose, behaviours), `active` |
| `kras` | A person's KRAs: title, measure, target, weight (weights add up to 100) |
| `users` | Sign-in accounts: email, scrypt hash, role (`admin`, `management`, `hr`, `member`), status (`pending`, `active`, `disabled`), linked `person_id` |
| `sessions`, `login_attempts`, `reset_tokens` | Sign-in state. Tokens are stored only as SHA-256 hashes. |
| `tasks` | `number` (shown as T-123), title, owner, creator, department, project tag, priority, source, status, start/due dates, `original_due`, `slips`, `completed_at`, `escalated_at`, blocked reason, links to initiative, milestone, KRA, meeting and repeating series |
| `task_checks`, `task_watchers`, `task_updates` | Steps, watchers, and the thread: comments plus a system entry for every change (status, owner, due date with reason) |
| `task_series` | Repeating tasks: rule (JSON), lead days, `last_due`, active. Unique `(series_id, due_date)` on tasks stops duplicates. |
| `meeting_rhythm`, `meetings` | The standing meetings (kind, cadence, chair, attendees) and each held meeting (attendance, notes, decisions, actions) |
| `scorecards` | Person, month, KRA scores (JSON), behaviour score, overall, band, status (`draft`, `shared`, `acknowledged`), comments |
| `improvement_plans`, `plan_checkins` | 60-day plans and their weekly check-ins |
| `kpis`, `kpi_values` | Department KPIs (unit, target, direction) and monthly values |
| `initiatives`, `milestones` | The 90-day rollout and hiring plan; milestones are the gates |
| `notifications`, `activity` | In-app notifications; an audit log of every change |
| `settings` | Rules and company name as JSON; `meta:*` keys hold job state |
| `backups` | Nightly and manual snapshots (JSON) |

To change the schema: edit `schema.ts`, run `npm run db:generate`, check the SQL it writes in `drizzle/`, commit both. The next deploy applies it.

## The rules (where they live)

| Rule | Where |
| --- | --- |
| Dates are India time, stored as `YYYY-MM-DD` strings. Working days default to Monday to Saturday. | `domain/dates.ts`, settings |
| Overdue: open and due before today. On time: done on or before the due date. A task counts towards on-time % once it is done or its date has passed. | `domain/tasks.ts` (`periodStats`) |
| On-time % to a suggested 1–5: 95% → 5, 85% → 4, 70% → 3, 50% → 2. | `domain/tasks.ts` (`onTimeToScore`) |
| The owner moving their own due date later needs a reason (unless turned off in Rules); the giver and the owner's manager are told; `slips` goes up. Givers and managers can move dates without a reason. | `actions/tasks.ts` (`updateTask`) |
| Blocking needs a reason; the giver and manager are told. | `actions/tasks.ts` |
| Only the giver, a manager of the owner, management or admin can reassign or cancel. Only the creator or an admin can delete. | `actions/tasks.ts` (`rights`) |
| Escalation: open tasks overdue for `escalateAfterDays` working days (default 2) notify the owner's manager and the giver, once. Moving the date to today or later re-arms it. | `jobs/daily.ts` |
| Repeating tasks are created from today on only; a missed day never creates an already-late task. | `jobs/daily.ts`, `domain/tasks.ts` |
| Score = weighted KRA average × 70% + behaviours × 30%. Bands: 4.5 outstanding, 3.5 strong, 3 meets, 2 below, else unsatisfactory. Two months running below 3 suggests a plan. | `domain/scoring.ts` |
| KPI status: on target when the value meets the target; close within 10%; otherwise off target, which notifies the director. | `domain/kpi.ts`, `actions/kpis.ts` |
| Muster roll: a person "logged work" on a day if they created, updated, commented on or finished a task. | `domain/muster.ts`, `data/stats.ts` |

## Who sees what

All in `src/lib/org.ts`, and enforced on the server in both `lib/data` (reads) and `lib/actions` (writes); the UI only hides what the server would refuse anyway.

- **Admin, Management**: everything.
- **HR**: as a member, plus every scorecard and improvement plan.
- **Member**: their own tasks, tasks they gave, tasks they watch, and the tasks of everyone they manage. "Manage" means their reporting subtree plus everyone in a department they head or direct.
- Department KPIs: entered by the department's head or director, management or admin.
- Settings pages: admins only (`settings/layout.tsx` redirects, and every admin action calls `requireAdmin()`).

## The daily job

`src/lib/jobs/daily.ts`. Vercel calls `/api/cron/daily` at 02:00 UTC (07:30 IST). As a fallback, the signed-in layout runs it after the response (`after()` in `(app)/layout.tsx`) on the first visit of the day. A conditional upsert on `settings` (`meta:daily`, `meta:digest`) means it runs once per day however many requests arrive.

It: creates repeating tasks, escalates overdue tasks, sends scorecard reminders on the 1st and on the scoring due day, reminds managers of improvement plans with no check-in for 7 days, takes the nightly backup (keeps 30), deletes notifications older than 120 days, and writes an activity entry. The email digest goes out separately, not before 7 am India time. Admins can run it by hand under Settings, Backups and email.

## Security

- Passwords: scrypt with a random salt (`auth/password.ts`), minimum 8 characters.
- Sessions: a random token in an HttpOnly, SameSite=Lax, Secure cookie `twt_session`; only its SHA-256 is stored. 12 hours, or 30 days with "keep me signed in". Signing out deletes the row.
- Sign-in limits: 5 failures per email or 30 per IP in 15 minutes lock that key for 15 minutes (`auth/limits.ts`).
- Sign-up creates a pending account; nobody sees anything until an admin approves and links it.
- Reset links: one use, 24 hours, made by an admin. `/recover` needs `SETUP_CODE` and only works for admin accounts.
- Headers: a strict Content Security Policy with a per-request nonce (`proxy.ts`), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a locked-down permissions policy (`next.config.ts`).
- Every server action and API route checks the session and the permission itself. The cron route requires `CRON_SECRET`.
- Backups never include password hashes, sessions or reset tokens.
- The repository holds no secrets and no real staff data; the real team workbook stays with the company.

## Tests

- **Unit** (`tests/unit`, Vitest): dates and working days, overdue/on-time, recurrence, the quick-add parser, scoring. `npm test`.
- **End-to-end** (`tests/e2e/workflow.spec.ts`, Playwright, 19 tests in order): first-admin setup and workbook import, sign-up and approval, quick add, a date move with a reason plus @mention and blocking, who sees what between a manager and their reports, the daily job (repeating tasks made once, escalation), bulk changes, role card and scorecard through to acknowledgement, a KPI going off target, meeting actions becoming tasks, an improvement plan, Excel downloads respecting access, dashboard and search, lockout and reset link, turning an account off, re-importing the same workbook changing nothing, the cron route needing its secret, the 390px phone layout with no sideways scroll, and no browser console errors on any page. They run against a production build on port 3100:

  ```bash
  createdb worktracker_test
  E2E_DATABASE_URL=postgres://postgres@localhost:5432/worktracker_test npm run build
  E2E_DATABASE_URL=postgres://postgres@localhost:5432/worktracker_test npm run test:e2e
  ```

  The global setup wipes that database first, and refuses unless it is local and has "test" in its name. Move `.env.local` aside while running them, because `next start` reads it.

## Known limits

- **No public holidays.** Working days are weekdays only (set in Rules). A holiday counts as a working day for escalation and the muster roll. A holiday list in settings, used by `workingDaysBetween` and `recentWorkingDays`, is the fix.
- **No file attachments** on tasks. Link to SharePoint/OneDrive in the notes. Adding them needs storage (Vercel Blob or S3).
- **Restoring a backup is manual.** Backups download as JSON; there is no restore button. For a real accident use Neon's point-in-time restore (6 hours on the free plan, longer on paid).
- **Not real time.** Pages show the data as of when they loaded; actions refresh the page, other people's changes appear on the next navigation.
- **Email only**, no WhatsApp or SMS. Notifications are in-app plus the morning email.
- **One company, one time zone** (India).
- **Vercel Hobby is for non-commercial use.** Move to Pro (US$20/month, checked October 2026) if Vercel asks.

## Common changes

| To change | Edit |
| --- | --- |
| Escalation days, working days, quiet days, scoring date, date-move reason | Settings, Rules (no code) |
| Departments, people, reporting lines, role cards, KRAs | Settings, People and Departments, or re-import the workbook (matches by name, adds and updates, never deletes) |
| Meeting rhythm | Meetings, Rhythm (admins) |
| A new task field | `schema.ts` + migration, `data/tasks.ts` (`taskColumns`), `actions/tasks.ts` (`updateTask`), `components/tasks/TaskPanelClient.tsx` |
| Quick-add syntax | `domain/quickadd.ts` and its tests |
| Scoring weights or bands | `domain/scoring.ts` and its tests |
| Colours, fonts | `src/app/globals.css` |
| Daily job time | `vercel.json` (UTC) |
| Email wording | `jobs/daily.ts` (`sendDigests`), `lib/mail.ts` |
