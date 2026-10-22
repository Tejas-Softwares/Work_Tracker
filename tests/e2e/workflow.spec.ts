import { test, expect } from "@playwright/test";
import path from "node:path";
import { closeDb, expectToast, istToday, istWeekday, noHorizontalScroll, openSession, personId, PASSWORD, quickAdd, signIn, signUp, sql, type Session } from "./helpers";

/**
 * One office, start to finish: setup, import, approvals, tasks across people, permissions,
 * the daily job, scorecards, KPIs, meetings, exports, plans, and the phone layout.
 */
test.describe.serial("Tejas Work Tracker", () => {
  const WORKBOOK = path.join(__dirname, "..", "fixtures", "Sample_Team_Structure.xlsx");
  const month = istToday().slice(0, 7);
  let admin: Session, arun: Session, kiran: Session, priya: Session, neha: Session;
  let raTask = 0;
  let kiranTask = 0;
  const sessions: Session[] = [];

  test.afterAll(async () => {
    for (const s of sessions) await s.ctx.close();
    await closeDb();
  });

  const expectNoErrors = () => {
    for (const s of sessions) expect(s.errors, s.errors.join("\n")).toEqual([]);
  };

  test("first admin sets up and imports the team", async ({ browser }) => {
    admin = await openSession(browser);
    sessions.push(admin);
    const p = admin.page;
    await p.goto("/login");
    await expect(p).toHaveURL(/\/setup/);
    await p.getByLabel("Setup code").fill("wrong-code");
    await p.getByLabel("Your name").fill("Asha Menon");
    await p.getByLabel("Work email").fill("asha@tejas.test");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Create the admin account" }).click();
    await expect(p.getByText("That setup code is not right.")).toBeVisible();
    await p.getByLabel("Setup code").fill("e2e-setup-code");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Create the admin account" }).click();
    await expect(p).toHaveURL(/\/settings\/import\?welcome=1/);

    await p.locator("input[type=file]").setInputFiles(WORKBOOK);
    await p.getByRole("button", { name: "Check the workbook" }).click();
    await expect(p.getByRole("cell", { name: "People" })).toBeVisible();
    await expect(p.getByRole("row", { name: /People 40 0/ })).toBeVisible();
    await p.getByRole("button", { name: /Import Sample_Team_Structure/ }).click();
    await expect(p.getByText(/Imported: 10 departments, 40 people, 188 kras, 29 kpis, 10 meetings, 2 initiatives, 7 milestones, 22 tasks/)).toBeVisible();
    const [c] = await sql<{ people: number; kras: number; tasks: number; backups: number }>(
      "select (select count(*)::int from people) people, (select count(*)::int from kras) kras, (select count(*)::int from tasks) tasks, (select count(*)::int from backups where kind = 'manual') backups",
    );
    expect(c).toEqual({ people: 40, kras: 188, tasks: 22, backups: 1 });

    // reporting lines from the workbook
    const [g] = await sql<{ boss: string }>("select b.name boss from people p join people b on b.id = p.reports_to where p.name = 'Kiran Salunkhe'");
    expect(g.boss).toBe("Arun Bhosale");

    // link the admin's own account to her name
    await p.goto("/settings/access");
    const row = p.getByRole("row", { name: /asha@tejas\.test/ });
    await row.getByRole("combobox", { name: "Linked to" }).click();
    await row.getByRole("combobox", { name: "Linked to" }).fill("Asha");
    await p.getByRole("option", { name: /Asha Menon/ }).click();
    await expectToast(p, "Linked");
    await expect(p.getByText(/account isn.t linked/)).toHaveCount(0);
  });

  test("people ask for access and the admin approves them", async ({ browser }) => {
    arun = await openSession(browser);
    kiran = await openSession(browser);
    priya = await openSession(browser);
    neha = await openSession(browser);
    sessions.push(arun, kiran, priya, neha);
    await signUp(arun.page, "Arun Bhosale", "arun@tejas.test");
    await signUp(kiran.page, "Kiran Salunkhe", "kiran@tejas.test");
    await signUp(priya.page, "Priya Patil", "priya@tejas.test");
    await signUp(neha.page, "Neha Kulkarni", "neha@tejas.test");

    // a pending account can't get in
    await signIn(arun.page, "arun@tejas.test");
    await expect(arun.page).toHaveURL(/\/pending/);

    const p = admin.page;
    await p.goto("/settings/access");
    await expect(p.getByRole("heading", { name: /Waiting for approval/ })).toBeVisible();
    for (const name of ["Arun Bhosale", "Kiran Salunkhe", "Priya Patil"]) {
      const card = p.locator("div.grid", { hasText: `${name.split(" ")[0].toLowerCase()}@tejas.test` }).filter({ has: p.getByRole("button", { name: "Approve" }) }).last();
      await expect(card.getByRole("combobox", { name: "This is" })).toHaveAttribute("placeholder", name); // matched to their name on the team list
      await card.getByRole("button", { name: "Approve" }).click();
      await expectToast(p, `${name} approved`);
    }
    const rCard = p.locator("div.grid", { hasText: "neha@tejas.test" }).filter({ has: p.getByRole("button", { name: "Approve" }) }).last();
    await rCard.getByLabel("Role").selectOption("management");
    await rCard.getByRole("button", { name: "Approve" }).click();
    await expectToast(p, "Neha Kulkarni approved");

    const users = await sql<{ email: string; role: string; status: string; person: string }>("select u.email, u.role, u.status, p.name person from users u left join people p on p.id = u.person_id order by u.email");
    expect(users.map((u) => `${u.email} ${u.role} ${u.status} ${u.person}`)).toEqual([
      "arun@tejas.test member active Arun Bhosale",
      "asha@tejas.test admin active Asha Menon",
      "kiran@tejas.test member active Kiran Salunkhe",
      "neha@tejas.test management active Neha Kulkarni",
      "priya@tejas.test member active Priya Patil",
    ]);
    for (const [s, e] of [[arun, "arun"], [kiran, "kiran"], [priya, "priya"], [neha, "neha"]] as const) {
      await signIn(s.page, `${e}@tejas.test`);
      await expect(s.page).toHaveURL(/\/my/);
    }
    await expect(arun.page.getByRole("heading", { name: /Arun$/ })).toBeVisible();
  });

  test("quick add gives a task to someone, with owner, project, priority and date read from one line", async () => {
    raTask = await quickAdd(admin.page, "Send RA bill 7 to Jabil @Arun #Jabil-1700 !high in 3 days");
    const [t] = await sql<{ title: string; owner: string; project: string; priority: string; due_date: string; source: string }>(
      "select t.title, p.name owner, t.project, t.priority, to_char(t.due_date,'YYYY-MM-DD') due_date, t.source from tasks t join people p on p.id = t.owner_id where t.number = $1",
      [raTask],
    );
    expect(t).toEqual({ title: "Send RA bill 7 to Jabil", owner: "Arun Bhosale", project: "Jabil-1700", priority: "high", due_date: istToday(3), source: "director" });
    // Arun is told
    await arun.page.goto("/notifications");
    await expect(arun.page.getByText(`Asha Menon gave you T-${raTask}: Send RA bill 7 to Jabil`)).toBeVisible();
  });

  test("the owner updates the task: date moved with a reason, a comment with @mention, then blocked", async () => {
    const p = arun.page;
    await p.goto("/my");
    await p.getByRole("link", { name: "Send RA bill 7 to Jabil" }).click();
    await expect(p.getByRole("dialog", { name: "Task" })).toBeVisible();
    const panel = p.getByRole("dialog", { name: "Task" });

    // moving his own due date later needs a reason
    await panel.locator("input[type=date]").fill(istToday(6));
    await expect(panel.getByText("Why is the date moving?")).toBeVisible();
    await panel.getByPlaceholder("Shared with whoever gave you the task").fill("Client measurement visit moved to Monday");
    await panel.getByRole("button", { name: "Move the date" }).click();
    await expectToast(p, "Date moved");
    const [t] = await sql<{ slips: number; due: string }>("select slips, to_char(due_date,'YYYY-MM-DD') due from tasks where number = $1", [raTask]);
    expect(t).toEqual({ slips: 1, due: istToday(6) });

    await panel.getByLabel("New update").fill("@Priya please check the cable rates in the bill");
    await panel.getByRole("button", { name: "Post update" }).click();
    await expectToast(p, "Update posted");

    await panel.getByRole("group", { name: "Status" }).getByRole("button", { name: "Blocked" }).click();
    await panel.getByPlaceholder("e.g. Waiting for client's approved drawings").fill("Waiting for client's signed JMR");
    await panel.getByRole("button", { name: "Mark blocked" }).click();
    await expectToast(p, /Marked blocked/);

    const notes = await sql<{ name: string; title: string }>("select p.name, n.title from notifications n join people p on p.id = n.person_id where n.link like $1 order by n.created_at", [`%open=${raTask}`]);
    const by = (n: string) => notes.filter((x) => x.name === n).map((x) => x.title);
    expect(by("Asha Menon").some((x) => /moved T-\d+ to .*Client measurement visit moved to Monday/.test(x))).toBe(true);
    expect(by("Priya Patil").some((x) => x.startsWith("Arun Bhosale mentioned you"))).toBe(true);
    expect(by("Vikram Joshi").some((x) => x.includes("is blocked: Waiting for client's signed JMR"))).toBe(true); // Arun's manager
    const [w] = await sql<{ n: number }>("select count(*)::int n from task_watchers w join tasks t on t.id = w.task_id where t.number = $1", [raTask]);
    expect(w.n).toBe(1); // Priya now watches it
  });

  test("a manager gives work to their report; people only see what is theirs", async () => {
    kiranTask = await quickAdd(arun.page, "Measurement sheet for Jabil block B @Kiran tomorrow");
    await kiran.page.goto("/my");
    await expect(kiran.page.getByRole("link", { name: "Measurement sheet for Jabil block B" })).toBeVisible();

    // Priya is not Kiran's manager: she can't open his task
    await priya.page.goto(`/tasks?open=${kiranTask}`);
    await expect(priya.page.getByText(`T-${kiranTask} isn't available`)).toBeVisible();
    // Arun manages Kiran: he sees it in My team
    await arun.page.goto("/tasks?scope=team");
    await expect(arun.page.getByRole("link", { name: /Measurement sheet for Jabil block B/ })).toBeVisible();
    // Kiran can't hand his task to someone else
    await kiran.page.goto(`/tasks?open=${kiranTask}`);
    await expect(kiran.page.getByRole("dialog", { name: "Task" }).getByText("Owner", { exact: true })).toBeVisible();
    await expect(kiran.page.getByRole("dialog", { name: "Task" }).getByRole("combobox", { name: "Owner" })).toHaveCount(0);

    // members can't open admin screens
    await priya.page.goto("/settings/access");
    await expect(priya.page).toHaveURL(/\/my$/);
    await priya.page.goto("/activity");
    await expect(priya.page).toHaveURL(/\/my$/);
    const r = await priya.page.request.get("/api/structure");
    expect(r.status()).toBe(403);
  });

  test("the daily job makes repeating tasks once and escalates late work to the manager", async () => {
    // a weekly report due on today's weekday; its first task is today's
    const weekly = await quickAdd(admin.page, `Weekly site report @Kiran every ${istWeekday()}`);
    const [s] = await sql<{ series_id: string; due: string }>("select series_id, to_char(due_date,'YYYY-MM-DD') due from tasks where number = $1", [weekly]);
    expect(s.series_id).toBeTruthy();
    expect(s.due).toBe(istToday());
    // pretend today's task hasn't been made yet: the job makes it, once
    await sql("delete from task_updates where task_id in (select id from tasks where number = $1)", [weekly]);
    await sql("delete from tasks where number = $1", [weekly]);
    await sql("update task_series set last_due = $1 where id = $2", [istToday(-7), s.series_id]);
    const late = await quickAdd(admin.page, `Old snag list @Kiran ${istToday(-7)}`);

    await admin.page.goto("/settings/system");
    await admin.page.getByRole("button", { name: "Run the daily job now" }).click();
    await expectToast(admin.page, /Done: 1 repeating task made/);
    const made = await sql<{ due: string }>("select to_char(due_date,'YYYY-MM-DD') due from tasks where series_id = $1", [s.series_id]);
    expect(made.map((m) => m.due)).toEqual([istToday()]);
    await admin.page.getByRole("button", { name: "Run the daily job now" }).click();
    await expectToast(admin.page, /Done: 0 repeating tasks made/);
    const [b] = await sql<{ n: number }>("select count(*)::int n from tasks where series_id = $1", [s.series_id]);
    expect(b.n).toBe(1);

    const [e] = await sql<{ escalated: boolean }>("select escalated_at is not null escalated from tasks where number = $1", [late]);
    expect(e.escalated).toBe(true);
    await arun.page.goto("/notifications");
    await expect(arun.page.getByText(new RegExp(`Overdue \\d+ working days: T-${late} Old snag list`))).toBeVisible();
  });

  test("bulk changes from the list", async () => {
    const a = await quickAdd(admin.page, "Bulk one @Asha tomorrow");
    const b = await quickAdd(admin.page, "Bulk two @Asha tomorrow");
    const p = admin.page;
    await p.goto("/tasks?scope=mine");
    await p.getByLabel(`Select T-${a}`).check();
    await p.getByLabel(`Select T-${b}`).check();
    await expect(p.getByText("2 selected")).toBeVisible();
    await p.getByRole("button", { name: "Mark done", exact: true }).click();
    await expectToast(p, "Marked done: 2 changed");
    const rows = await sql<{ status: string }>("select status from tasks where number = any($1)", [[a, b]]);
    expect(rows.map((r) => r.status)).toEqual(["done", "done"]);
  });

  test("a manager edits a role card and scores the month; the person reads and acknowledges it", async () => {
    const gid = await personId("Kiran Salunkhe");
    const p = arun.page;
    await p.goto(`/team/${gid}`);
    await p.getByRole("button", { name: "Edit role card" }).click();
    await p.getByLabel("Role purpose").fill("Executes Jabil and Ather site work to the daily plan and records progress the same day.");
    await p.getByRole("button", { name: "Save role card" }).click();
    await expectToast(p, "Role card saved");
    const [rp] = await sql<{ role_purpose: string }>("select role_purpose from people where id = $1", [gid]);
    expect(rp.role_purpose).toContain("records progress the same day");

    // Arun can't score himself
    const aid = await personId("Arun Bhosale");
    await p.goto(`/scorecards/${aid}/${month}`);
    await expect(p.getByText(/hasn't shared your/)).toBeVisible();

    await p.goto(`/scorecards/${gid}/${month}`);
    const groups = p.getByRole("radiogroup");
    const n = await groups.count();
    expect(n).toBe(6); // 5 KRAs + behaviours
    // sharing with a gap is refused
    await p.getByRole("button", { name: "Share with Kiran" }).click();
    await expectToast(p, /Score every KRA before sharing/);
    for (let i = 0; i < n; i++) await groups.nth(i).getByRole("radio").nth(3).click();
    await expect(p.getByText("Strong", { exact: true })).toBeVisible();
    await p.getByLabel("What to improve next month").fill("File the daily report before 7 pm every day.");
    await p.getByRole("button", { name: "Share with Kiran" }).click();
    await expectToast(p, "Shared with Kiran Salunkhe.");
    const [card] = await sql<{ status: string; overall: string }>("select status, overall::text from scorecards where person_id = $1 and month = $2", [gid, month]);
    expect(card).toEqual({ status: "shared", overall: "4.00" });

    const g = kiran.page;
    await g.goto(`/scorecards/${gid}/${month}`);
    await expect(g.getByText("4.00").first()).toBeVisible();
    await g.getByRole("button", { name: "I've read my scorecard" }).click();
    await expectToast(g, "Thanks. Your manager has been told.");
    const [ack] = await sql<{ status: string }>("select status from scorecards where person_id = $1 and month = $2", [gid, month]);
    expect(ack.status).toBe("acknowledged");
  });

  test("management enters a KPI; off target goes red and tells the director", async () => {
    const p = neha.page;
    await p.goto("/kpis");
    const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month.slice(5, 7)) - 1];
    const label = `Lost-time incidents, ${short} ${month.slice(0, 4)}`;
    const input = p.getByLabel(label);
    await input.fill("1");
    await input.press("Enter");
    await expectToast(p, "Saved");
    const [v] = await sql<{ value: string }>("select value::text from kpi_values kv join kpis k on k.id = kv.kpi_id where k.name = 'Lost-time incidents' and kv.month = $1", [month]);
    expect(Number(v.value)).toBe(1);
    const n = await sql("select 1 from notifications n join people p on p.id = n.person_id where p.name = 'Vikram Joshi' and n.title like 'Lost-time incidents is off target%'");
    expect(n.length).toBe(1);
    // a member can't type KPI figures
    await priya.page.goto("/kpis");
    await expect(priya.page.getByLabel(label)).toHaveCount(0);
  });

  test("a meeting is recorded and its actions become tasks", async () => {
    const p = admin.page;
    await p.goto("/meetings");
    await p.getByPlaceholder("Other meeting, e.g. Ather site visit").fill("Ather site visit");
    await p.getByPlaceholder("Other meeting, e.g. Ather site visit").press("Enter");
    await expect(p).toHaveURL(/\/meetings\/[a-z0-9]+$/);
    await expect(p.getByRole("heading", { name: "Ather site visit" })).toBeVisible();
    await p.getByRole("button", { name: "Add action" }).first().click();
    await expect(p.getByRole("heading", { name: "New task: Ather site visit" })).toBeVisible();
    const box = p.getByLabel("What needs doing");
    await box.fill("Send revised cable schedule @Sawant tomorrow");
    await box.press("Enter");
    await expectToast(p, /Added T-\d+ for Sawant/);
    await p.keyboard.press("Escape");
    await p.reload();
    await expect(p.getByText("Actions from this meeting (1)")).toBeVisible();
    const [t] = await sql<{ source: string; has_meeting: boolean }>("select source, meeting_id is not null has_meeting from tasks where title = 'Send revised cable schedule'");
    expect(t).toEqual({ source: "other", has_meeting: true });
  });

  test("improvement plan with a weekly check-in", async () => {
    const gid = await personId("Kiran Salunkhe");
    const p = arun.page;
    await p.goto(`/plans/new?person=${gid}`);
    await p.getByLabel("Why the plan is needed").fill("Daily reports missing on 6 of 20 working days in October; two RA inputs late.");
    await p.getByRole("textbox", { name: "Goal" }).fill("Daily report every working day");
    await p.getByRole("textbox", { name: "Measure" }).fill("20 of 20 days, by 7 pm");
    await p.getByRole("button", { name: "Start the plan" }).click();
    await expect(p).toHaveURL(/\/plans\/[a-z0-9]+$/);
    await p.getByPlaceholder("What was discussed, what changed, what was agreed for next week").fill("Reports filed 5 of 6 days. Agreed to file from site before leaving.");
    await p.getByRole("button", { name: "Add check-in" }).click();
    await expect(p.getByText("Reports filed 5 of 6 days")).toBeVisible();
    // Kiran can read his plan; Priya can't
    const [plan] = await sql<{ id: string }>("select id from improvement_plans where person_id = $1", [gid]);
    await kiran.page.goto(`/plans/${plan.id}`);
    await expect(kiran.page.getByText("Daily report every working day")).toBeVisible();
    await priya.page.goto(`/plans/${plan.id}`);
    await expect(priya.page.getByRole("heading", { name: "Not found" })).toBeVisible();
  });

  test("Excel downloads work and respect access", async () => {
    for (const url of ["/api/export/tasks", "/api/export/weekly", `/api/export/scorecards?month=${month}`, `/api/export/kpis?month=${month}`, "/api/structure"]) {
      const r = await admin.page.request.get(url);
      expect(r.status(), url).toBe(200);
      expect(r.headers()["content-type"]).toContain("spreadsheetml");
      expect((await r.body()).subarray(0, 2).toString()).toBe("PK");
    }
    expect((await priya.page.request.get(`/api/export/scorecards?month=${month}`)).status()).toBe(403);
    expect((await priya.page.request.get("/api/export/tasks")).status()).toBe(200); // her own tasks only
  });

  test("dashboard, team and search load for management", async () => {
    const p = neha.page;
    await p.goto("/dashboard");
    await expect(p.getByRole("heading", { name: "Office dashboard" })).toBeVisible();
    await expect(p.getByText("Who logged work, last 14 working days")).toBeVisible();
    await p.goto("/team");
    await expect(p.getByRole("link", { name: /Kiran Salunkhe/ })).toBeVisible();
    await p.goto("/search?q=Jabil");
    await expect(p.getByRole("link", { name: /Send RA bill 7 to Jabil/ })).toBeVisible();
    await p.goto("/initiatives");
    await p.getByRole("link", { name: "90-day structure rollout" }).click();
    await expect(p.getByText("Day 30: everyone tracked").first()).toBeVisible();
  });

  test("wrong passwords lock the account; a reset link gets the person back in", async ({ browser }) => {
    const intruder = await openSession(browser);
    sessions.push(intruder);
    for (let i = 0; i < 5; i++) {
      await signIn(intruder.page, "priya@tejas.test", "not-her-password");
      await expect(intruder.page.getByRole("alert").filter({ hasText: /don't match|Too many/ })).toBeVisible();
    }
    await signIn(intruder.page, "priya@tejas.test", PASSWORD);
    await expect(intruder.page.getByText(/Too many wrong passwords/)).toBeVisible();

    const p = admin.page;
    await p.goto("/settings/access");
    await p.getByRole("row", { name: /priya@tejas\.test/ }).getByRole("button", { name: "Reset link" }).click();
    const link = await p.getByRole("dialog").locator("input").inputValue();
    expect(link).toMatch(/\/reset\/[\w-]{20,}$/);
    await p.keyboard.press("Escape");

    const s = intruder.page;
    await s.goto(new URL(link).pathname);
    await s.getByLabel("New password", { exact: true }).fill("Priya#New2026");
    await s.getByLabel("New password again").fill("Priya#New2026");
    await s.getByRole("button", { name: "Set password and sign in" }).click();
    await expect(s).toHaveURL(/\/my/);
    // the link works once
    await s.context().clearCookies();
    await s.goto(new URL(link).pathname);
    await s.getByLabel("New password", { exact: true }).fill("Another#2026x");
    await s.getByLabel("New password again").fill("Another#2026x");
    await s.getByRole("button", { name: "Set password and sign in" }).click();
    await expect(s.getByText(/has been used or has expired/)).toBeVisible();
  });

  test("turning an account off signs the person out", async () => {
    const p = admin.page;
    await p.goto("/settings/access");
    await p.getByRole("row", { name: /kiran@tejas\.test/ }).getByRole("button", { name: "Turn off" }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Turn off" }).click();
    await expectToast(p, "Turned off");
    await kiran.page.goto("/my");
    await expect(kiran.page).toHaveURL(/\/login/);
    await signIn(kiran.page, "kiran@tejas.test");
    await expect(kiran.page.getByText("This account has been turned off.")).toBeVisible();
  });

  test("importing the same workbook again changes nothing", async () => {
    const p = admin.page;
    await p.goto("/settings/import");
    await p.locator("input[type=file]").setInputFiles(WORKBOOK);
    await p.getByRole("button", { name: "Check the workbook" }).click();
    await expect(p.getByRole("row", { name: /People 0 40/ })).toBeVisible();
    await p.getByRole("button", { name: /Import Sample_Team_Structure/ }).click();
    await expect(p.getByText(/Imported:/)).toBeVisible();
    const [c] = await sql<{ people: number; kras: number; imported: number }>(
      "select (select count(*)::int from people) people, (select count(*)::int from kras where active) kras, (select count(*)::int from tasks where initiative_id is not null) imported",
    );
    expect(c).toEqual({ people: 40, kras: 188, imported: 22 });
  });

  test("the scheduled job needs the secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    const ok = await request.get("/api/cron/daily", { headers: { Authorization: "Bearer e2e-cron-secret" } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });

  test("phone width: nothing runs off the screen", async ({ browser }) => {
    const m = await openSession(browser, { mobile: true });
    sessions.push(m);
    await signIn(m.page, "arun@tejas.test");
    await expect(m.page).toHaveURL(/\/my/);
    for (const url of ["/my", "/tasks", "/tasks?view=board", `/tasks?open=${raTask}`, "/team", "/meetings", "/scorecards", "/kpis", "/dashboard", "/notifications", "/initiatives"]) {
      await m.page.goto(url);
      await m.page.waitForLoadState("networkidle");
      await noHorizontalScroll(m.page);
    }
    // the bottom bar's + opens New task
    await m.page.goto("/my");
    await m.page.getByRole("button", { name: "New task" }).click();
    await expect(m.page.getByLabel("What needs doing")).toBeVisible();
  });

  test("no browser errors anywhere", async () => {
    expectNoErrors();
  });
});

