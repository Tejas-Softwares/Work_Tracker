import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  serial,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tejas Work Tracker data model.
 * Ids are short random strings (see lib/ids.ts). Dates a person acts on (due, held on, month) are plain
 * calendar dates in India time; moments (created, completed) are timestamps.
 */

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- organisation

export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Short code used on chips, e.g. PRJ. */
  code: text("code").notNull().default(""),
  /** Portfolio this department sits under, e.g. Operations. */
  portfolio: text("portfolio").notNull().default(""),
  headPersonId: text("head_person_id"),
  directorPersonId: text("director_person_id"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    designation: text("designation").notNull().default(""),
    departmentId: text("department_id"),
    reportsTo: text("reports_to"),
    email: text("email"),
    phone: text("phone"),
    /** A seat for someone not yet hired (shown as "New hire"). */
    isVacancy: boolean("is_vacancy").notNull().default(false),
    active: boolean("active").notNull().default(true),
    rolePurpose: text("role_purpose").notNull().default(""),
    behaviours: jsonb("behaviours").$type<string[]>().notNull().default([]),
    /** Dotted-line coordination, free text, e.g. "Cummins PM". */
    dottedLine: text("dotted_line").notNull().default(""),
    joinedOn: date("joined_on", { mode: "string" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("people_dept_idx").on(t.departmentId), index("people_reports_idx").on(t.reportsTo)],
);

export const kras = pgTable(
  "kras",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    title: text("title").notNull(),
    measure: text("measure").notNull().default(""),
    target: text("target").notNull().default(""),
    weight: integer("weight").notNull().default(20),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [index("kras_person_idx").on(t.personId)],
);

// ---------------------------------------------------------------- sign-in

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** admin | management | hr | member */
    role: text("role").notNull().default("member"),
    /** pending | active | disabled */
    status: text("status").notNull().default("pending"),
    personId: text("person_id"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_person_idx").on(t.personId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: updated(),
});

export const resetTokens = pgTable("reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: created(),
});

// ---------------------------------------------------------------- work

export const initiatives = pgTable("initiatives", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerPersonId: text("owner_person_id"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  /** planned | active | on_hold | done */
  status: text("status").notNull().default("active"),
  createdBy: text("created_by"),
  createdAt: created(),
  updatedAt: updated(),
});

export const milestones = pgTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    initiativeId: text("initiative_id").notNull(),
    name: text("name").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    criteria: text("criteria").notNull().default(""),
    /** pending | met | missed */
    status: text("status").notNull().default("pending"),
    metOn: date("met_on", { mode: "string" }),
    sort: integer("sort").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("milestones_init_idx").on(t.initiativeId)],
);

export const taskSeries = pgTable("task_series", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  ownerId: text("owner_id").notNull(),
  departmentId: text("department_id"),
  project: text("project").notNull().default(""),
  priority: text("priority").notNull().default("medium"),
  /** { type: "daily" } | { type: "weekly", dow: 1 } | { type: "monthly", dom: 5 } */
  rule: jsonb("rule").$type<RecurrenceRule>().notNull(),
  /** Days before the due date that each new task appears. */
  leadDays: integer("lead_days").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** Last due date a task was created for. */
  lastDue: date("last_due", { mode: "string" }),
  initiativeId: text("initiative_id"),
  kraId: text("kra_id"),
  createdBy: text("created_by"),
  createdAt: created(),
  updatedAt: updated(),
});

export type RecurrenceRule =
  | { type: "daily" }
  | { type: "weekly"; dow: number }
  | { type: "monthly"; dom: number };

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    number: serial("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    ownerId: text("owner_id").notNull(),
    createdBy: text("created_by"),
    departmentId: text("department_id"),
    project: text("project").notNull().default(""),
    /** low | medium | high | critical */
    priority: text("priority").notNull().default("medium"),
    /** todo | in_progress | blocked | done | cancelled */
    status: text("status").notNull().default("todo"),
    blockedReason: text("blocked_reason").notNull().default(""),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    /** The first due date given, so slips can be measured. */
    originalDue: date("original_due", { mode: "string" }),
    slips: integer("slips").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** self | huddle | project_review | management_review | monthly_review | one_to_one | director | client | email | other */
    source: text("source").notNull().default("self"),
    meetingId: text("meeting_id"),
    initiativeId: text("initiative_id"),
    milestoneId: text("milestone_id"),
    kraId: text("kra_id"),
    seriesId: text("series_id"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("tasks_number_idx").on(t.number),
    index("tasks_owner_idx").on(t.ownerId),
    index("tasks_status_idx").on(t.status),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_initiative_idx").on(t.initiativeId),
    index("tasks_meeting_idx").on(t.meetingId),
    uniqueIndex("tasks_series_due_idx").on(t.seriesId, t.dueDate),
  ],
);

export const taskChecks = pgTable(
  "task_checks",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("task_checks_task_idx").on(t.taskId)],
);

export const taskWatchers = pgTable(
  "task_watchers",
  {
    taskId: text("task_id").notNull(),
    personId: text("person_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.personId] }), index("task_watchers_person_idx").on(t.personId)],
);

export const taskUpdates = pgTable(
  "task_updates",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    authorPersonId: text("author_person_id"),
    authorName: text("author_name").notNull().default(""),
    /** comment | created | status | due | owner | priority | edit | check */
    kind: text("kind").notNull().default("comment"),
    body: text("body").notNull().default(""),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: created(),
  },
  (t) => [index("task_updates_task_idx").on(t.taskId), index("task_updates_author_idx").on(t.authorPersonId, t.createdAt)],
);

// ---------------------------------------------------------------- meetings

export const meetingRhythm = pgTable("meeting_rhythm", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  departmentId: text("department_id"),
  /** daily | weekly | monthly | quarterly */
  cadence: text("cadence").notNull().default("daily"),
  /** weekly: 1 = Monday … 7 = Sunday. monthly: day of month. */
  day: integer("day"),
  time: text("time").notNull().default(""),
  durationMin: integer("duration_min").notNull().default(15),
  chairPersonId: text("chair_person_id"),
  purpose: text("purpose").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: created(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    rhythmId: text("rhythm_id"),
    /** huddle | project_review | management_review | monthly_review | one_to_one | quarterly_review | other */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    departmentId: text("department_id"),
    heldOn: date("held_on", { mode: "string" }).notNull(),
    chairPersonId: text("chair_person_id"),
    attendeeIds: jsonb("attendee_ids").$type<string[]>().notNull().default([]),
    absentIds: jsonb("absent_ids").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    decisions: text("decisions").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("meetings_held_idx").on(t.heldOn), index("meetings_dept_idx").on(t.departmentId)],
);

// ---------------------------------------------------------------- performance

export const scorecards = pgTable(
  "scorecards",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    /** YYYY-MM */
    month: text("month").notNull(),
    kraScores: jsonb("kra_scores").$type<Record<string, { score: number | null; note?: string; title?: string; weight?: number }>>().notNull().default({}),
    behaviourScore: numeric("behaviour_score", { precision: 3, scale: 1 }),
    overall: numeric("overall", { precision: 4, scale: 2 }),
    taskStats: jsonb("task_stats").$type<Record<string, number>>().notNull().default({}),
    managerComment: text("manager_comment").notNull().default(""),
    strengths: text("strengths").notNull().default(""),
    improve: text("improve").notNull().default(""),
    /** draft | shared | acknowledged */
    status: text("status").notNull().default("draft"),
    scoredBy: text("scored_by"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    employeeComment: text("employee_comment").notNull().default(""),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("scorecards_person_month_idx").on(t.personId, t.month)],
);

export const improvementPlans = pgTable("improvement_plans", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  managerPersonId: text("manager_person_id"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  reason: text("reason").notNull().default(""),
  goals: jsonb("goals").$type<{ text: string; measure: string; met: boolean | null }[]>().notNull().default([]),
  support: text("support").notNull().default(""),
  /** active | completed */
  status: text("status").notNull().default("active"),
  /** improved | extended | role_change | exit | "" */
  outcome: text("outcome").notNull().default(""),
  outcomeNote: text("outcome_note").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: created(),
  updatedAt: updated(),
});

export const planCheckins = pgTable(
  "plan_checkins",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    heldOn: date("held_on", { mode: "string" }).notNull(),
    /** on_track | some_progress | off_track */
    progress: text("progress").notNull().default("some_progress"),
    note: text("note").notNull().default(""),
    authorPersonId: text("author_person_id"),
    createdAt: created(),
  },
  (t) => [index("plan_checkins_plan_idx").on(t.planId)],
);

export const kpis = pgTable("kpis", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default(""),
  target: numeric("target", { precision: 14, scale: 2 }),
  /** higher | lower */
  direction: text("direction").notNull().default("higher"),
  ownerPersonId: text("owner_person_id"),
  description: text("description").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const kpiValues = pgTable(
  "kpi_values",
  {
    kpiId: text("kpi_id").notNull(),
    month: text("month").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }).notNull(),
    note: text("note").notNull().default(""),
    enteredBy: text("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kpiId, t.month] })],
);

// ---------------------------------------------------------------- system

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index("notifications_person_idx").on(t.personId, t.createdAt)],
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name").notNull().default(""),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updated(),
});

export const backups = pgTable("backups", {
  id: text("id").primaryKey(),
  /** nightly | manual */
  kind: text("kind").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  data: text("data").notNull(),
  createdBy: text("created_by"),
  createdAt: created(),
});
