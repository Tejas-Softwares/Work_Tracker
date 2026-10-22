# Tejas Work Tracker

The office's one place for who owns what, what's due, and what's late. Built for Tejas Group (Tejash Electricals Project Pvt. Ltd.) to put the Team Structure & Work Tracking Plan into daily use.

## What it does

| Area | What people do there |
| --- | --- |
| **My work** | Each person's open tasks by due date, what they gave others, this month's on-time figure, their role card, and (for managers) their team's late, blocked and quiet people. |
| **Tasks** | One line adds a task: `Send RA bill to Jabil @Ravi #Jabil-1700 !high fri`. List or board, saved views (Mine, My team, Overdue, Blocked, Given by me), filters, bulk changes, Excel download. Each task has notes, steps, watchers, an update thread with @mentions, and a full history. |
| **Rules that keep it honest** | Moving your own due date later needs a reason, shared with whoever gave the task. Blocking a task needs a reason and tells the manager. Tasks overdue 2 working days are escalated to the owner's manager, once. Repeating tasks (daily, weekly, monthly) appear by themselves. |
| **Meetings** | The meeting rhythm (daily huddles, Monday project review, Wednesday management review, monthly business review, one-to-ones). Starting one opens an agenda built from the tracker, last meeting's open actions, attendance, decisions, and actions that become tasks. Shows how many huddles were actually held. |
| **Initiatives** | The 90-day rollout and the hiring plan: gates on a timeline, tasks per gate, progress. |
| **Team and roles** | The reporting tree, departments, and each person's role card: purpose, 4–6 weighted KRAs, expected behaviours. |
| **Scorecards** | Managers score each person monthly, 1–5 per KRA (70%) and behaviours (30%), with the tracker's on-time figure beside them. The person reads and acknowledges it. Two months below 3 suggests an improvement plan. |
| **Improvement plans** | A written 60-day plan with goals, support and weekly check-ins, and a recorded outcome. |
| **Department KPIs** | Each head enters the month's figures; on target, close or off target against the target; off target tells the director. |
| **Dashboard** | Open, overdue, blocked, on-time %, finished per week, on-time by week, departments side by side, and a muster roll of who logged work on each of the last 14 working days. Weekly report in Excel. |
| **Admin** | Approve sign-ups and link them to names, roles, people and departments, import the team from Excel, rules (working days, escalation, quiet days, scoring date), backups, the activity log. |

Who sees what: everyone sees their own work; managers see everyone below them in the reporting tree and in departments they head; HR sees all scorecards and plans; management and admins see everything.

## Getting it online

`docs/SETUP.md` has the click-by-click steps for Vercel and a free Neon database (about 15 minutes). The team structure comes from `Tejas_Team_Structure.xlsx`, which is kept outside this repository because the repository is public.

## For the developer

- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind 4, Drizzle ORM on Postgres (Neon), ExcelJS, nodemailer.
- `docs/HANDOVER.md`: architecture, data model, the rules, security, how to change things.
- `docs/TEAM-GUIDE.md`: the guide for the office.

```bash
npm install
cp .env.example .env.local        # DATABASE_URL, SETUP_CODE, CRON_SECRET
npm run db:migrate
npm run dev                        # http://localhost:3000
npm test                           # unit tests (34)
E2E_DATABASE_URL=postgres://...worktracker_test npm run build && npm run test:e2e   # end-to-end (19)
```

| Folder | What is there |
| --- | --- |
| `src/app/(auth)` | Sign in, ask for access, first-time setup, reset links, admin recovery, "not ready yet" |
| `src/app/(app)` | Every signed-in page |
| `src/app/api` | Excel downloads, team workbook, backup download, the daily job |
| `src/lib/domain` | Business rules as plain functions with unit tests: dates in India time, overdue and on-time, recurrence, quick-add parsing, scoring, KPI status, muster roll |
| `src/lib/actions` | Server actions: every change, with its permission check |
| `src/lib/data` | Queries, scoped to what the viewer may see |
| `src/lib/excel` | Team workbook import and export, report workbooks |
| `src/lib/jobs/daily.ts` | Repeating tasks, escalations, reminders, backup, morning email |
| `drizzle/` | Database migrations (run automatically on every deploy) |
| `tests/` | Unit tests, end-to-end tests, a sample team with made-up names |
