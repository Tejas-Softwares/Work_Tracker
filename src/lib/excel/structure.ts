import "server-only";
import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { isISODate } from "../domain/dates";
import { toNumber } from "../domain/kpi";

/**
 * The team structure lives in one Excel workbook so HR can prepare it offline and the names never sit in
 * the code. Sheets: Departments, People, KRAs, KPIs, Meetings, Initiatives, Milestones, Tasks.
 * Importing again updates what is there (matched by name) and adds what is new; nothing is deleted.
 */

export const SHEETS = {
  Departments: ["Department", "Code", "Portfolio", "Head", "Director", "Order"],
  People: ["Name", "Designation", "Department", "Reports to", "Email", "Phone", "New hire seat", "Role purpose", "Behaviours", "Dotted line", "Active"],
  KRAs: ["Person", "KRA", "Measure", "Target", "Weight"],
  KPIs: ["Department", "KPI", "Unit", "Target", "Better when", "Owner", "Notes"],
  Meetings: ["Meeting", "Kind", "Department", "Cadence", "Day", "Time", "Minutes", "Chair", "Purpose"],
  Initiatives: ["Initiative", "Owner", "Start", "End", "Status", "Description"],
  Milestones: ["Initiative", "Milestone", "Due", "Criteria"],
  Tasks: ["Initiative", "Milestone", "Task", "Owner", "Due", "Priority", "Notes"],
} as const;

type SheetName = keyof typeof SHEETS;
type Row = Record<string, string>;

export type ImportPlan = {
  counts: Record<string, { add: number; update: number }>;
  warnings: string[];
  errors: string[];
  rows: Partial<Record<SheetName, Row[]>>;
};

const MEETING_KINDS: Record<string, string> = {
  "daily huddle": "huddle",
  huddle: "huddle",
  "project review": "project_review",
  "management review": "management_review",
  "monthly business review": "monthly_review",
  "monthly review": "monthly_review",
  "one-to-one": "one_to_one",
  "one to one": "one_to_one",
  "quarterly review": "quarterly_review",
  other: "other",
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Excel dates come in as UTC midnights
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? v.hyperlink).trim();
    return "";
  }
  return String(v).trim();
}

function key(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function yes(s: string): boolean {
  return ["yes", "y", "true", "1", "new hire", "vacancy"].includes(key(s));
}

function readDate(s: string): string | null {
  if (!s) return null;
  if (isISODate(s.slice(0, 10))) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

export async function readWorkbook(buf: ArrayBuffer): Promise<Partial<Record<SheetName, Row[]>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out: Partial<Record<SheetName, Row[]>> = {};
  for (const name of Object.keys(SHEETS) as SheetName[]) {
    const ws = wb.worksheets.find((w) => key(w.name) === key(name));
    if (!ws) continue;
    // header row: the first row that has the sheet's first column name
    let headerRow = 1;
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map(cellText).map(key);
      if (vals.includes(key(SHEETS[name][0]))) {
        headerRow = r;
        break;
      }
    }
    const header = (ws.getRow(headerRow).values as ExcelJS.CellValue[]).map(cellText);
    const rows: Row[] = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const vals = ws.getRow(r).values as ExcelJS.CellValue[];
      const row: Row = {};
      let any = false;
      header.forEach((h, i) => {
        if (!h) return;
        const col = (SHEETS[name] as readonly string[]).find((c) => key(c) === key(h));
        if (!col) return;
        const t = cellText(vals[i]);
        row[col] = t;
        if (t) any = true;
      });
      if (any) rows.push(row);
    }
    out[name] = rows;
  }
  return out;
}

/** Checks the workbook against what is already in the app, without changing anything. */
export async function planImport(rows: Partial<Record<SheetName, Row[]>>): Promise<ImportPlan> {
  const plan: ImportPlan = { counts: {}, warnings: [], errors: [], rows };
  const [depts, people, kpis, rhythm, inits] = await Promise.all([
    db().select().from(schema.departments),
    db().select().from(schema.people),
    db().select().from(schema.kpis),
    db().select().from(schema.meetingRhythm),
    db().select().from(schema.initiatives),
  ]);
  const deptNames = new Set([...depts.map((d) => key(d.name)), ...(rows.Departments ?? []).map((r) => key(r.Department ?? ""))]);
  const personNames = new Set([...people.map((p) => key(p.name)), ...(rows.People ?? []).map((r) => key(r.Name ?? ""))]);
  const initNames = new Set([...inits.map((i) => key(i.name)), ...(rows.Initiatives ?? []).map((r) => key(r.Initiative ?? ""))]);
  const count = (sheet: string, exists: boolean) => {
    plan.counts[sheet] ??= { add: 0, update: 0 };
    plan.counts[sheet][exists ? "update" : "add"]++;
  };
  const needPerson = (sheet: string, n: number, field: string, v: string) => {
    if (v && !personNames.has(key(v))) plan.warnings.push(`${sheet} row ${n}: “${v}” in ${field} is not on the People sheet or the team list, so it is left empty.`);
  };

  (rows.Departments ?? []).forEach((r, i) => {
    if (!r.Department) return plan.errors.push(`Departments row ${i + 2}: the department has no name.`);
    count("Departments", depts.some((d) => key(d.name) === key(r.Department)));
    needPerson("Departments", i + 2, "Head", r.Head ?? "");
    needPerson("Departments", i + 2, "Director", r.Director ?? "");
  });
  const seen = new Set<string>();
  (rows.People ?? []).forEach((r, i) => {
    if (!r.Name) return plan.errors.push(`People row ${i + 2}: the person has no name.`);
    if (seen.has(key(r.Name))) plan.errors.push(`People row ${i + 2}: “${r.Name}” appears twice. Names must be unique; add a surname or initial.`);
    seen.add(key(r.Name));
    count("People", people.some((p) => key(p.name) === key(r.Name)));
    if (r.Department && !deptNames.has(key(r.Department))) plan.warnings.push(`People row ${i + 2}: department “${r.Department}” is not on the Departments sheet, so it is left empty.`);
    needPerson("People", i + 2, "Reports to", r["Reports to"] ?? "");
    if (r["Reports to"] && key(r["Reports to"]) === key(r.Name)) plan.errors.push(`People row ${i + 2}: ${r.Name} can't report to themselves.`);
    if (r.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.Email)) plan.warnings.push(`People row ${i + 2}: “${r.Email}” doesn't look like an email address.`);
  });
  // reporting loops
  const reportsTo = new Map<string, string>();
  for (const p of people) if (p.reportsTo) reportsTo.set(key(p.name), key(people.find((x) => x.id === p.reportsTo)?.name ?? ""));
  for (const r of rows.People ?? []) if (r.Name) reportsTo.set(key(r.Name), key(r["Reports to"] ?? ""));
  for (const start of reportsTo.keys()) {
    const path = new Set<string>([start]);
    let cur = reportsTo.get(start);
    while (cur) {
      if (path.has(cur)) {
        plan.errors.push(`Reporting lines loop back on themselves around “${start}”. Check the Reports to column.`);
        break;
      }
      path.add(cur);
      cur = reportsTo.get(cur);
    }
    if (plan.errors.some((e) => e.startsWith("Reporting lines loop"))) break;
  }

  const weights = new Map<string, number>();
  (rows.KRAs ?? []).forEach((r, i) => {
    if (!r.Person || !r.KRA) return plan.errors.push(`KRAs row ${i + 2}: needs a person and a KRA.`);
    if (!personNames.has(key(r.Person))) plan.warnings.push(`KRAs row ${i + 2}: “${r.Person}” is not on the People sheet, so this KRA is skipped.`);
    count("KRAs", false);
    weights.set(key(r.Person), (weights.get(key(r.Person)) ?? 0) + (toNumber(r.Weight) ?? 0));
  });
  for (const [p, w] of weights) if (w && w !== 100) plan.warnings.push(`KRAs for “${p}” add up to ${w}%, not 100%. Scores still work; weights are used in proportion.`);

  (rows.KPIs ?? []).forEach((r, i) => {
    if (!r.Department || !r.KPI) return plan.errors.push(`KPIs row ${i + 2}: needs a department and a KPI.`);
    if (!deptNames.has(key(r.Department))) plan.warnings.push(`KPIs row ${i + 2}: department “${r.Department}” is unknown, so this KPI is skipped.`);
    count("KPIs", kpis.some((k) => key(k.name) === key(r.KPI)));
    needPerson("KPIs", i + 2, "Owner", r.Owner ?? "");
  });
  (rows.Meetings ?? []).forEach((r, i) => {
    if (!r.Meeting) return plan.errors.push(`Meetings row ${i + 2}: the meeting has no name.`);
    if (r.Kind && !MEETING_KINDS[key(r.Kind)]) plan.warnings.push(`Meetings row ${i + 2}: kind “${r.Kind}” is unknown; it is saved as Other.`);
    count("Meetings", rhythm.some((m) => key(m.title) === key(r.Meeting)));
    needPerson("Meetings", i + 2, "Chair", r.Chair ?? "");
  });
  (rows.Initiatives ?? []).forEach((r, i) => {
    if (!r.Initiative) return plan.errors.push(`Initiatives row ${i + 2}: needs a name.`);
    count("Initiatives", inits.some((x) => key(x.name) === key(r.Initiative)));
    needPerson("Initiatives", i + 2, "Owner", r.Owner ?? "");
  });
  (rows.Milestones ?? []).forEach((r, i) => {
    if (!r.Initiative || !r.Milestone) return plan.errors.push(`Milestones row ${i + 2}: needs an initiative and a milestone.`);
    if (!initNames.has(key(r.Initiative))) plan.warnings.push(`Milestones row ${i + 2}: initiative “${r.Initiative}” is unknown, so it is skipped.`);
    count("Milestones", false);
  });
  (rows.Tasks ?? []).forEach((r, i) => {
    if (!r.Task || !r.Owner) return plan.errors.push(`Tasks row ${i + 2}: needs a task and an owner.`);
    needPerson("Tasks", i + 2, "Owner", r.Owner);
    count("Tasks", false);
  });
  return plan;
}

const CADENCES = ["daily", "weekly", "monthly", "quarterly"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Applies the workbook. Matching is by name, so running it twice changes nothing the second time. */
export async function applyImport(rows: Partial<Record<SheetName, Row[]>>, actorPersonId: string | null): Promise<Record<string, number>> {
  const done: Record<string, number> = {};
  const bump = (k: string) => (done[k] = (done[k] ?? 0) + 1);

  // Departments (names first; heads after people exist)
  const depts = await db().select().from(schema.departments);
  const deptByName = new Map(depts.map((d) => [key(d.name), d]));
  for (const [i, r] of (rows.Departments ?? []).entries()) {
    if (!r.Department) continue;
    const existing = deptByName.get(key(r.Department));
    const values = {
      name: r.Department.trim(),
      code: (r.Code || r.Department.slice(0, 3)).toUpperCase().slice(0, 6),
      portfolio: r.Portfolio ?? "",
      sort: toNumber(r.Order) ?? i,
    };
    if (existing) {
      await db().update(schema.departments).set({ ...values, updatedAt: new Date() }).where(eq(schema.departments.id, existing.id));
      deptByName.set(key(r.Department), { ...existing, ...values });
    } else {
      const id = newId();
      await db().insert(schema.departments).values({ id, ...values });
      deptByName.set(key(r.Department), { ...values, id } as typeof existing & { id: string });
    }
    bump("Departments");
  }

  // People, then reporting lines
  const people = await db().select().from(schema.people);
  const personByName = new Map(people.map((p) => [key(p.name), p]));
  for (const r of rows.People ?? []) {
    if (!r.Name) continue;
    const dept = r.Department ? deptByName.get(key(r.Department)) : undefined;
    const existing = personByName.get(key(r.Name));
    const values = {
      name: r.Name.trim(),
      designation: r.Designation ?? "",
      departmentId: dept?.id ?? null,
      email: r.Email ? r.Email.trim().toLowerCase() : existing?.email ?? null,
      phone: r.Phone || existing?.phone || null,
      isVacancy: yes(r["New hire seat"] ?? ""),
      rolePurpose: r["Role purpose"] ?? existing?.rolePurpose ?? "",
      behaviours: r.Behaviours ? r.Behaviours.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean) : existing?.behaviours ?? [],
      dottedLine: r["Dotted line"] ?? "",
      active: r.Active ? !["no", "n", "false", "0", "left"].includes(key(r.Active)) : true,
    };
    if (existing) {
      await db().update(schema.people).set({ ...values, updatedAt: new Date() }).where(eq(schema.people.id, existing.id));
      personByName.set(key(r.Name), { ...existing, ...values });
    } else {
      const id = newId();
      await db().insert(schema.people).values({ id, ...values });
      personByName.set(key(r.Name), { ...values, id } as typeof existing & { id: string });
    }
    bump("People");
  }
  const pid = (name: string | undefined) => (name ? personByName.get(key(name))?.id ?? null : null);
  for (const r of rows.People ?? []) {
    if (!r.Name) continue;
    const me = pid(r.Name);
    const boss = pid(r["Reports to"]);
    if (me) await db().update(schema.people).set({ reportsTo: boss && boss !== me ? boss : null }).where(eq(schema.people.id, me));
  }
  for (const r of rows.Departments ?? []) {
    const d = r.Department ? deptByName.get(key(r.Department)) : undefined;
    if (!d) continue;
    await db().update(schema.departments).set({ headPersonId: pid(r.Head), directorPersonId: pid(r.Director) }).where(eq(schema.departments.id, d.id));
  }

  // KRAs: matched by person + title; KRAs missing from the sheet for a listed person are switched off.
  const byPerson = new Map<string, Row[]>();
  for (const r of rows.KRAs ?? []) {
    const p = pid(r.Person);
    if (!p || !r.KRA) continue;
    if (!byPerson.has(p)) byPerson.set(p, []);
    byPerson.get(p)!.push(r);
  }
  for (const [personId, list] of byPerson) {
    const existing = await db().select().from(schema.kras).where(eq(schema.kras.personId, personId));
    const keep = new Set<string>();
    for (const [i, r] of list.entries()) {
      const found = existing.find((k) => key(k.title) === key(r.KRA));
      const values = { title: r.KRA.trim(), measure: r.Measure ?? "", target: r.Target ?? "", weight: Math.round(toNumber(r.Weight) ?? 20), sort: i, active: true };
      if (found) {
        await db().update(schema.kras).set(values).where(eq(schema.kras.id, found.id));
        keep.add(found.id);
      } else {
        const id = newId();
        await db().insert(schema.kras).values({ id, personId, ...values });
        keep.add(id);
      }
      bump("KRAs");
    }
    for (const k of existing) if (!keep.has(k.id) && k.active) await db().update(schema.kras).set({ active: false }).where(eq(schema.kras.id, k.id));
  }

  // KPIs
  const kpis = await db().select().from(schema.kpis);
  for (const [i, r] of (rows.KPIs ?? []).entries()) {
    const d = r.Department ? deptByName.get(key(r.Department)) : undefined;
    if (!d || !r.KPI) continue;
    const found = kpis.find((k) => k.departmentId === d.id && key(k.name) === key(r.KPI));
    const target = toNumber(r.Target);
    const values = {
      departmentId: d.id,
      name: r.KPI.trim(),
      unit: r.Unit ?? "",
      target: target === null ? null : String(target),
      direction: key(r["Better when"] ?? "").startsWith("lower") ? "lower" : "higher",
      ownerPersonId: pid(r.Owner),
      description: r.Notes ?? "",
      sort: i,
      active: true,
    };
    if (found) await db().update(schema.kpis).set(values).where(eq(schema.kpis.id, found.id));
    else await db().insert(schema.kpis).values({ id: newId(), ...values });
    bump("KPIs");
  }

  // Meeting rhythm
  const rhythm = await db().select().from(schema.meetingRhythm);
  for (const [i, r] of (rows.Meetings ?? []).entries()) {
    if (!r.Meeting) continue;
    const found = rhythm.find((m) => key(m.title) === key(r.Meeting));
    const cadence = CADENCES.includes(key(r.Cadence ?? "")) ? key(r.Cadence) : "weekly";
    const dayText = key(r.Day ?? "");
    const day = cadence === "weekly" ? (DAYS.findIndex((d) => d.startsWith(dayText.slice(0, 3))) + 1 || 1) : cadence === "monthly" ? toNumber(r.Day) ?? 1 : null;
    const values = {
      title: r.Meeting.trim(),
      kind: MEETING_KINDS[key(r.Kind ?? "")] ?? "other",
      departmentId: r.Department ? deptByName.get(key(r.Department))?.id ?? null : null,
      cadence,
      day: dayText || cadence === "monthly" ? day : null,
      time: r.Time ?? "",
      durationMin: Math.round(toNumber(r.Minutes) ?? 30),
      chairPersonId: pid(r.Chair),
      purpose: r.Purpose ?? "",
      sort: i,
      active: true,
    };
    if (found) await db().update(schema.meetingRhythm).set(values).where(eq(schema.meetingRhythm.id, found.id));
    else await db().insert(schema.meetingRhythm).values({ id: newId(), ...values });
    bump("Meetings");
  }

  // Initiatives, milestones, starter tasks
  const inits = await db().select().from(schema.initiatives);
  const initByName = new Map(inits.map((x) => [key(x.name), x.id]));
  for (const r of rows.Initiatives ?? []) {
    if (!r.Initiative) continue;
    const status = ["planned", "active", "on_hold", "done"].includes(key(r.Status ?? "").replace(" ", "_")) ? key(r.Status).replace(" ", "_") : "active";
    const values = { name: r.Initiative.trim(), ownerPersonId: pid(r.Owner), startDate: readDate(r.Start ?? ""), endDate: readDate(r.End ?? ""), status, description: r.Description ?? "" };
    const id = initByName.get(key(r.Initiative));
    if (id) await db().update(schema.initiatives).set({ ...values, updatedAt: new Date() }).where(eq(schema.initiatives.id, id));
    else {
      const nid = newId();
      await db().insert(schema.initiatives).values({ id: nid, ...values, createdBy: actorPersonId });
      initByName.set(key(r.Initiative), nid);
    }
    bump("Initiatives");
  }
  const ms = await db().select().from(schema.milestones);
  for (const [i, r] of (rows.Milestones ?? []).entries()) {
    const initiativeId = r.Initiative ? initByName.get(key(r.Initiative)) : undefined;
    if (!initiativeId || !r.Milestone) continue;
    const found = ms.find((m) => m.initiativeId === initiativeId && key(m.name) === key(r.Milestone));
    const values = { initiativeId, name: r.Milestone.trim(), dueDate: readDate(r.Due ?? ""), criteria: r.Criteria ?? "", sort: i };
    if (found) await db().update(schema.milestones).set(values).where(eq(schema.milestones.id, found.id));
    else {
      const id = newId();
      await db().insert(schema.milestones).values({ id, ...values });
      ms.push({ id, ...values, status: "pending", metOn: null, createdAt: new Date() });
    }
    bump("Milestones");
  }
  for (const r of rows.Tasks ?? []) {
    const owner = r.Owner ? personByName.get(key(r.Owner)) : undefined;
    if (!owner || !r.Task) continue;
    const initiativeId = r.Initiative ? initByName.get(key(r.Initiative)) ?? null : null;
    const milestoneId = initiativeId && r.Milestone ? ms.find((m) => m.initiativeId === initiativeId && key(m.name) === key(r.Milestone))?.id ?? null : null;
    const dup = await db()
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(sql`lower(${schema.tasks.title}) = ${key(r.Task)}`, initiativeId ? eq(schema.tasks.initiativeId, initiativeId) : sql`${schema.tasks.initiativeId} is null`))
      .limit(1);
    if (dup.length) continue;
    const due = readDate(r.Due ?? "");
    const pr = key(r.Priority ?? "");
    await db().insert(schema.tasks).values({
      id: newId(),
      title: r.Task.trim().slice(0, 300),
      description: r.Notes ?? "",
      ownerId: owner.id,
      createdBy: actorPersonId,
      departmentId: owner.departmentId,
      priority: ["low", "medium", "high", "critical"].includes(pr) ? pr : "medium",
      source: "director",
      dueDate: due,
      originalDue: due,
      initiativeId,
      milestoneId,
    });
    bump("Tasks");
  }

  // Link accounts to people by email
  await db().execute(sql`update users u set person_id = p.id from people p where u.person_id is null and p.email is not null and lower(p.email) = u.email`);
  return done;
}

// ---------------------------------------------------------------- building workbooks

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF23305A" } };

function styleSheet(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = HEAD_FILL;
  ws.getRow(1).height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

const WIDTHS: Record<SheetName, number[]> = {
  Departments: [26, 8, 22, 26, 26, 8],
  People: [26, 30, 24, 26, 30, 16, 14, 60, 60, 22, 8],
  KRAs: [26, 44, 50, 26, 8],
  KPIs: [22, 46, 10, 10, 12, 24, 40],
  Meetings: [34, 24, 22, 11, 11, 9, 9, 24, 50],
  Initiatives: [36, 24, 12, 12, 10, 60],
  Milestones: [36, 40, 12, 60],
  Tasks: [36, 36, 50, 24, 12, 10, 50],
};

/** The current structure as a workbook in the import format, so it can be edited and imported again. */
export async function structureWorkbook(empty = false): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tejas Work Tracker";
  const guide = wb.addWorksheet("How to fill");
  guide.getColumn(1).width = 110;
  [
    "Tejas Work Tracker: team structure workbook",
    "",
    "Fill the sheets, then upload this file in Settings, Import team. You see what will change before anything is saved.",
    "People are matched by name, departments by name, KPIs by department and name. Importing again updates and adds; it never deletes.",
    "Departments: Head is the person who answers for the department's numbers. Director is the portfolio owner above them.",
    "People: Reports to must be another name on this sheet. New hire seat = Yes for a role you are hiring for; give it the role as its name.",
    "People: Behaviours are separated by semicolons. Active = No for someone who has left.",
    "KRAs: 4 to 6 per person, weights adding to 100. Measure says how it is checked; Target says what good looks like.",
    "KPIs: Better when is Higher or Lower. Targets are numbers; Unit can be %, days, ₹ lakh or a word.",
    "Meetings: Kind is Daily huddle, Project review, Management review, Monthly business review, One-to-one or Quarterly review.",
    "Meetings: Cadence is Daily, Weekly, Monthly or Quarterly. Day is a weekday for weekly meetings, a day number for monthly ones.",
    "Dates: use the date format of your Excel, or 2026-11-02.",
  ].forEach((t, i) => {
    const c = guide.getCell(i + 1, 1);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14, color: { argb: "FF23305A" } };
  });

  const sheets = {} as Record<SheetName, ExcelJS.Worksheet>;
  for (const name of Object.keys(SHEETS) as SheetName[]) {
    const ws = wb.addWorksheet(name);
    ws.addRow([...SHEETS[name]]);
    styleSheet(ws, WIDTHS[name]);
    sheets[name] = ws;
  }
  if (empty) return wb;

  const [depts, people, kras, kpis, rhythm, inits, ms] = await Promise.all([
    db().select().from(schema.departments).orderBy(schema.departments.sort),
    db().select().from(schema.people).orderBy(schema.people.name),
    db().select().from(schema.kras).where(eq(schema.kras.active, true)).orderBy(schema.kras.sort),
    db().select().from(schema.kpis).orderBy(schema.kpis.sort),
    db().select().from(schema.meetingRhythm).orderBy(schema.meetingRhythm.sort),
    db().select().from(schema.initiatives),
    db().select().from(schema.milestones).orderBy(schema.milestones.sort),
  ]);
  const pn = new Map(people.map((p) => [p.id, p.name]));
  const dn = new Map(depts.map((d) => [d.id, d.name]));
  const inn = new Map(inits.map((i) => [i.id, i.name]));
  const kindLabel: Record<string, string> = {
    huddle: "Daily huddle",
    project_review: "Project review",
    management_review: "Management review",
    monthly_review: "Monthly business review",
    one_to_one: "One-to-one",
    quarterly_review: "Quarterly review",
    other: "Other",
  };
  for (const d of depts) sheets.Departments.addRow([d.name, d.code, d.portfolio, pn.get(d.headPersonId ?? "") ?? "", pn.get(d.directorPersonId ?? "") ?? "", d.sort]);
  for (const p of people)
    sheets.People.addRow([p.name, p.designation, dn.get(p.departmentId ?? "") ?? "", pn.get(p.reportsTo ?? "") ?? "", p.email ?? "", p.phone ?? "", p.isVacancy ? "Yes" : "No", p.rolePurpose, p.behaviours.join("; "), p.dottedLine, p.active ? "Yes" : "No"]);
  for (const k of kras) sheets.KRAs.addRow([pn.get(k.personId) ?? "", k.title, k.measure, k.target, k.weight]);
  for (const k of kpis) sheets.KPIs.addRow([dn.get(k.departmentId) ?? "", k.name, k.unit, k.target === null ? "" : Number(k.target), k.direction === "lower" ? "Lower" : "Higher", pn.get(k.ownerPersonId ?? "") ?? "", k.description]);
  for (const m of rhythm)
    sheets.Meetings.addRow([
      m.title,
      kindLabel[m.kind] ?? "Other",
      dn.get(m.departmentId ?? "") ?? "",
      m.cadence[0].toUpperCase() + m.cadence.slice(1),
      m.cadence === "weekly" && m.day ? DAYS[m.day - 1][0].toUpperCase() + DAYS[m.day - 1].slice(1) : m.day ?? "",
      m.time,
      m.durationMin,
      pn.get(m.chairPersonId ?? "") ?? "",
      m.purpose,
    ]);
  for (const i of inits) sheets.Initiatives.addRow([i.name, pn.get(i.ownerPersonId ?? "") ?? "", i.startDate ?? "", i.endDate ?? "", i.status, i.description]);
  for (const m of ms) sheets.Milestones.addRow([inn.get(m.initiativeId) ?? "", m.name, m.dueDate ?? "", m.criteria]);
  return wb;
}
