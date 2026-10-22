// Test fixture only: fills a database that already has the team imported with eight weeks of made-up work,
// so the dashboards and scorecards can be checked visually. Never run this against the real database.
import pg from "pg";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url || !/localhost/.test(url)) throw new Error("Demo data is for a local test database only.");
const db = new pg.Client({ connectionString: url });
await db.connect();
const id = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).toLowerCase();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const people = (await db.query("select id, name, department_id, reports_to, is_vacancy from people where active and not is_vacancy")).rows;
const depts = Object.fromEntries((await db.query("select id, name from departments")).rows.map((d) => [d.id, d.name]));
const titles = {
  "Estimation & Bids": ["Price Visteon R4 point wiring BOQ", "Collect cable quotes for Epiroc tender", "Take-off for Jabil B-1800 lighting", "Update rate library for LT panels", "Answer pre-bid queries for TE Shirwal"],
  Design: ["Cable schedule for Ather block C", "As-built drawings for Mahindra Chakan", "Earthing layout revision for Jabil", "Single-line diagram for Cummins substation"],
  Projects: ["Daily progress report, Ather site", "Raise indent for 4C x 300 sq mm cable", "Joint measurement with client, Jabil", "Close snag list at TE Shirwal", "Three-week look-ahead for Mahindra", "Submit RA bill inputs for October"],
  "Procurement & Stores": ["Place PO for LT panel", "Three quotes for MCCB order", "Follow up cable delivery", "Monthly stock count", "Register new vendor for cable trays"],
  "Finance & Billing": ["RA bill 7 for Jabil B-1700", "GST reconciliation for September", "Bank guarantee renewal for Ather", "Supplier payment run", "Follow up overdue receivable, Visteon"],
  HR: ["Joining formalities for site engineers", "PF and ESIC returns", "Contract labour licence renewal, Cummins", "Shortlist HR Manager candidates"],
  EHS: ["Site safety audit, Ather", "Close unsafe-act observations", "Toolbox talk records for October"],
  Liaisoning: ["MSEDCL load sanction for Ather", "Electrical inspector approval, Jabil"],
  Leadership: ["Review bid pipeline", "Approve Ather cable PO"],
  "Strategy & Systems": ["Set up the Work Tracker for the office", "Monthly MIS pack"],
};
// each person gets a "reliability" so the dashboard shows a believable spread; a few are quiet
const quiet = new Set(people.filter((_, i) => i % 9 === 4).map((p) => p.id));
let made = 0;
for (const p of people) {
  const rel = quiet.has(p.id) ? 0.35 : 0.55 + rnd() * 0.42;
  const list = titles[depts[p.department_id]] ?? ["General work"];
  const n = 6 + Math.floor(rnd() * 10);
  for (let i = 0; i < n; i++) {
    const created = addDays(today, -Math.floor(rnd() * 56));
    const due = addDays(created, 2 + Math.floor(rnd() * 12));
    let status = "todo";
    let completed = null;
    if (due < today) {
      if (rnd() < rel + 0.15) {
        status = "done";
        const late = rnd() > rel ? 1 + Math.floor(rnd() * 5) : -Math.floor(rnd() * 2);
        const c = addDays(due, late);
        completed = (c > today ? today : c) + "T11:30:00+05:30";
      } else status = rnd() < 0.18 ? "blocked" : rnd() < 0.5 ? "in_progress" : "todo";
    } else status = rnd() < 0.3 ? "in_progress" : rnd() < 0.06 ? "blocked" : "todo";
    const tid = id();
    await db.query(
      `insert into tasks (id, title, owner_id, created_by, department_id, project, priority, status, blocked_reason, due_date, original_due, completed_at, source, slips, created_at, last_activity_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$14) returning number`,
      [tid, pick(list), p.id, p.reports_to ?? p.id, p.department_id, pick(["Ather", "Jabil B-1700", "TE Shirwal", "Mahindra Chakan", "Visteon", "Cummins", ""]), pick(["low", "medium", "medium", "high", "critical"]), status,
       status === "blocked" ? pick(["Waiting for client's approved drawings", "Supplier hasn't confirmed delivery date", "Need Director's approval on rate", "Site access pending gate pass"]) : "",
       due, completed, pick(["self", "director", "huddle", "project_review"]), rnd() < 0.2 ? 1 + Math.floor(rnd() * 2) : 0, `${created}T10:00:00+05:30`],
    );
    made++;
    await db.query("insert into task_updates (id, task_id, author_person_id, author_name, kind, body, created_at) values ($1,$2,$3,$4,'created','Created this task',$5)", [id(), tid, p.reports_to ?? p.id, "", `${created}T10:00:00+05:30`]);
    // progress notes on working days, fewer for quiet people
    const notes = quiet.has(p.id) ? (rnd() < 0.3 ? 1 : 0) : 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < notes; k++) {
      let d = addDays(created, Math.floor(rnd() * 14));
      if (d > today) d = today;
      if (quiet.has(p.id) && d > addDays(today, -6)) d = addDays(today, -8);
      await db.query("insert into task_updates (id, task_id, author_person_id, author_name, kind, body, created_at) values ($1,$2,$3,$4,'comment',$5,$6)", [id(), tid, p.id, p.name, pick(["Spoke to the client, drawings expected Monday", "Half done, rest after material arrives", "Sent for checking", "Quotes received from two vendors"]), `${d}T${String(9 + Math.floor(rnd() * 8)).padStart(2, "0")}:15:00+05:30`]);
    }
    if (status === "done") await db.query("insert into task_updates (id, task_id, author_person_id, author_name, kind, body, created_at) values ($1,$2,$3,$4,'status','Marked done',$5)", [id(), tid, p.id, p.name, completed]);
  }
}
// KPI values for last month and this month
const kpis = (await db.query("select id, target, direction from kpis")).rows;
const months = [today.slice(0, 7), addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)];
for (const k of kpis) for (const m of months) {
  if (rnd() < 0.25) continue;
  const t = k.target === null ? 50 : Number(k.target);
  const v = k.direction === "lower" ? t * (0.7 + rnd() * 0.6) : t * (0.8 + rnd() * 0.25);
  await db.query("insert into kpi_values (kpi_id, month, value) values ($1,$2,$3) on conflict do nothing", [k.id, m, Math.round(v * 10) / 10]);
}
console.log(`demo: ${made} tasks for ${people.length} people`);
await db.end();
