CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text DEFAULT '' NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"portfolio" text DEFAULT '' NOT NULL,
	"head_person_id" text,
	"director_person_id" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"manager_person_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"support" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"outcome_note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_person_id" text,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_values" (
	"kpi_id" text NOT NULL,
	"month" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"entered_by" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_values_kpi_id_month_pk" PRIMARY KEY("kpi_id","month")
);
--> statement-breakpoint
CREATE TABLE "kpis" (
	"id" text PRIMARY KEY NOT NULL,
	"department_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"target" numeric(14, 2),
	"direction" text DEFAULT 'higher' NOT NULL,
	"owner_person_id" text,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kras" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"title" text NOT NULL,
	"measure" text DEFAULT '' NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 20 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_rhythm" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"department_id" text,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"day" integer,
	"time" text DEFAULT '' NOT NULL,
	"duration_min" integer DEFAULT 15 NOT NULL,
	"chair_person_id" text,
	"purpose" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"rhythm_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"department_id" text,
	"held_on" date NOT NULL,
	"chair_person_id" text,
	"attendee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"absent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"decisions" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"initiative_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" date,
	"criteria" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"met_on" date,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"department_id" text,
	"reports_to" text,
	"email" text,
	"phone" text,
	"is_vacancy" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"role_purpose" text DEFAULT '' NOT NULL,
	"behaviours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dotted_line" text DEFAULT '' NOT NULL,
	"joined_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"held_on" date NOT NULL,
	"progress" text DEFAULT 'some_progress' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"author_person_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"month" text NOT NULL,
	"kra_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"behaviour_score" numeric(3, 1),
	"overall" numeric(4, 2),
	"task_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manager_comment" text DEFAULT '' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"improve" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scored_by" text,
	"shared_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"employee_comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_series" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"department_id" text,
	"project" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"rule" jsonb NOT NULL,
	"lead_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_due" date,
	"initiative_id" text,
	"kra_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"author_person_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'comment' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_watchers" (
	"task_id" text NOT NULL,
	"person_id" text NOT NULL,
	CONSTRAINT "task_watchers_task_id_person_id_pk" PRIMARY KEY("task_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"created_by" text,
	"department_id" text,
	"project" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"blocked_reason" text DEFAULT '' NOT NULL,
	"start_date" date,
	"due_date" date,
	"original_due" date,
	"slips" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"source" text DEFAULT 'self' NOT NULL,
	"meeting_id" text,
	"initiative_id" text,
	"milestone_id" text,
	"kra_id" text,
	"series_id" text,
	"escalated_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"person_id" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "kras_person_idx" ON "kras" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "meetings_held_idx" ON "meetings" USING btree ("held_on");--> statement-breakpoint
CREATE INDEX "meetings_dept_idx" ON "meetings" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "milestones_init_idx" ON "milestones" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "notifications_person_idx" ON "notifications" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "people_dept_idx" ON "people" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "people_reports_idx" ON "people" USING btree ("reports_to");--> statement-breakpoint
CREATE INDEX "plan_checkins_plan_idx" ON "plan_checkins" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecards_person_month_idx" ON "scorecards" USING btree ("person_id","month");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_checks_task_idx" ON "task_checks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_updates_task_idx" ON "task_updates" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_updates_author_idx" ON "task_updates" USING btree ("author_person_id","created_at");--> statement-breakpoint
CREATE INDEX "task_watchers_person_idx" ON "task_watchers" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_number_idx" ON "tasks" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_initiative_idx" ON "tasks" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "tasks_meeting_idx" ON "tasks" USING btree ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_series_due_idx" ON "tasks" USING btree ("series_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_person_idx" ON "users" USING btree ("person_id");