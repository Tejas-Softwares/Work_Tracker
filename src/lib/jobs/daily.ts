import "server-only";
import { and, eq, inArray, isNull, lt, sql, desc } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "../ids";
import { getSettings, getMeta, setMeta } from "../settings";
import { addDays, addMonths, formatDate, monthLabel, monthOf, todayISO, workingDaysBetween, isoDate } from "../domain/dates";
import { dueDatesToCreate, OPEN_STATUSES } from "../domain/tasks";
import { notify } from "../notify";
import { makeBackup } from "../backup";
import { mailEnabled, sendMail, escapeHtml } from "../mail";
import { appUrl } from "../env";
import { logActivity } from "../activity";

/** Claims the day's run so two requests never do it twice. */
async function claim(key: string, today: string): Promise<boolean> {
  const r = await db().execute(sql`
    insert into settings (key, value, updated_at) values (${`meta:${key}`}, ${JSON.stringify({ date: today })}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where settings.value->>'date' is distinct from ${today}
    returning key`);
  return (r.rows?.length ?? 0) > 0;
}

function hourInIndia(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now));
}

export async function runDailyJobIfDue(opts: { fromCron?: boolean } = {}): Promise<Record<string, unknown>> {
  const today = todayISO();
  const out: Record<string, unknown> = {};
  if (await claim("daily", today)) out.work = await runDailyWork(today);
  // Emails go out from 7 am India time, so a late-night visit doesn't send the morning digest at midnight.
  if ((opts.fromCron || hourInIndia() >= 7) && mailEnabled() && (await claim("digest", today))) out.digest = await sendDigests(today);
  return out;
}

export async function runDailyWork(today: string): Promise<Record<string, number>> {
  const settings = await getSettings();
  const wd = settings.rules.workingDays;
  const counts: Record<string, number> = { created: 0, escalated: 0, reminders: 0 };

  // 1. Repeating tasks
  const series = await db().select().from(schema.taskSeries).where(eq(schema.taskSeries.active, true));
  const people = await db().select().from(schema.people);
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const s of series) {
    const owner = byId.get(s.ownerId);
    if (!owner || !owner.active) continue;
    // Only dates from today on: a day the job missed doesn't become an instantly-late task.
    const dates = dueDatesToCreate(s.rule, s.lastDue, today, s.leadDays, today, wd);
    for (const due of dates) {
      const inserted = await db()
        .insert(schema.tasks)
        .values({
          id: newId(),
          title: s.title,
          description: s.description,
          ownerId: s.ownerId,
          createdBy: s.createdBy,
          departmentId: owner.departmentId,
          project: s.project,
          priority: s.priority,
          source: "self",
          dueDate: due,
          originalDue: due,
          initiativeId: s.initiativeId,
          kraId: s.kraId,
          seriesId: s.id,
        })
        .onConflictDoNothing()
        .returning({ id: schema.tasks.id });
      if (inserted.length) counts.created++;
    }
    if (dates.length) await db().update(schema.taskSeries).set({ lastDue: dates[dates.length - 1], updatedAt: new Date() }).where(eq(schema.taskSeries.id, s.id));
  }

  // 2. Escalate tasks overdue for N working days to the owner's manager, once.
  const overdue = await db()
    .select()
    .from(schema.tasks)
    .where(and(inArray(schema.tasks.status, OPEN_STATUSES), lt(schema.tasks.dueDate, today), isNull(schema.tasks.escalatedAt)));
  for (const t of overdue) {
    const late = workingDaysBetween(t.dueDate!, today, wd);
    if (late < settings.rules.escalateAfterDays) continue;
    const owner = byId.get(t.ownerId);
    const manager = owner?.reportsTo ? byId.get(owner.reportsTo) : undefined;
    await notify([manager?.id, t.createdBy !== t.ownerId ? t.createdBy : null], {
      kind: "escalation",
      title: `Overdue ${late} working days: T-${t.number} ${t.title}`,
      body: `${owner?.name ?? "Someone"}'s task was due ${formatDate(t.dueDate!, today)}.`,
      link: `/tasks?open=${t.number}`,
    }, t.ownerId);
    await notify([t.ownerId], { kind: "overdue", title: `T-${t.number} is ${late} working days late and your manager has been told`, body: t.title, link: `/tasks?open=${t.number}` });
    await db().update(schema.tasks).set({ escalatedAt: new Date() }).where(eq(schema.tasks.id, t.id));
    counts.escalated++;
  }

  // 3. Scorecards: on the 1st, managers are asked to score last month; on the due day, a reminder for any missing.
  const day = Number(today.slice(8, 10));
  const lastMonth = addMonths(monthOf(today), -1);
  if (day === 1 || day === settings.rules.scoreByDay) {
    const done = await db().select({ personId: schema.scorecards.personId, status: schema.scorecards.status }).from(schema.scorecards).where(eq(schema.scorecards.month, lastMonth));
    const shared = new Set(done.filter((d) => d.status !== "draft").map((d) => d.personId));
    const managers = new Map<string, string[]>();
    for (const p of people) {
      if (!p.active || p.isVacancy || !p.reportsTo || shared.has(p.id)) continue;
      if (!managers.has(p.reportsTo)) managers.set(p.reportsTo, []);
      managers.get(p.reportsTo)!.push(p.name);
    }
    for (const [mid, names] of managers) {
      await notify([mid], {
        kind: "scorecard",
        title: day === 1 ? `Score ${monthLabel(lastMonth)} for your team (${names.length})` : `Scorecards for ${monthLabel(lastMonth)} are due today (${names.length} left)`,
        body: names.slice(0, 8).join(", "),
        link: `/scorecards?month=${lastMonth}`,
      });
      counts.reminders++;
    }
  }

  // 4. Improvement plans without a check-in for 7 days: remind the manager.
  const plans = await db().select().from(schema.improvementPlans).where(eq(schema.improvementPlans.status, "active"));
  for (const p of plans) {
    const last = (await db().select().from(schema.planCheckins).where(eq(schema.planCheckins.planId, p.id)).orderBy(desc(schema.planCheckins.heldOn)).limit(1))[0];
    const since = last?.heldOn ?? p.startDate;
    if (since <= addDays(today, -7) && p.managerPersonId) {
      await notify([p.managerPersonId], { kind: "plan", title: `Weekly check-in due: ${byId.get(p.personId)?.name ?? "improvement plan"}`, link: `/plans/${p.id}` });
      counts.reminders++;
    }
  }

  // 5. Nightly backup, and tidy old read notifications.
  await makeBackup("nightly");
  await db().delete(schema.notifications).where(and(lt(schema.notifications.createdAt, new Date(Date.now() - 120 * 86_400_000))));
  await logActivity(null, "daily_job", "system", null, `Daily run: ${counts.created} repeating tasks, ${counts.escalated} escalations, ${counts.reminders} reminders, backup made`);
  return counts;
}

/** Morning email: each person's overdue and due-today tasks, plus unread notifications. */
export async function sendDigests(today: string): Promise<{ sent: number; failed: number }> {
  const settings = await getSettings();
  if (!settings.email.dailyDigest) return { sent: 0, failed: 0 };
  const users = await db().select().from(schema.users).where(eq(schema.users.status, "active"));
  let sent = 0;
  let failed = 0;
  const base = appUrl();
  for (const u of users) {
    if (!u.personId) continue;
    const tasks = await db()
      .select({ number: schema.tasks.number, title: schema.tasks.title, dueDate: schema.tasks.dueDate, status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.ownerId, u.personId), inArray(schema.tasks.status, OPEN_STATUSES), sql`${schema.tasks.dueDate} <= ${today}`))
      .orderBy(schema.tasks.dueDate);
    const unread = await db()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.personId, u.personId), isNull(schema.notifications.readAt), isNull(schema.notifications.emailedAt)))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(15);
    if (!tasks.length && !unread.length) continue;
    const late = tasks.filter((t) => t.dueDate! < today);
    const dueToday = tasks.filter((t) => t.dueDate === today);
    const li = (t: (typeof tasks)[number]) => `<li><a href="${base}/tasks?open=${t.number}">T-${t.number}</a> ${escapeHtml(t.title)}${t.dueDate! < today ? ` <span style="color:#9a6700">(due ${formatDate(t.dueDate!, today)})</span>` : ""}</li>`;
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1a2238">
<p>Good morning ${escapeHtml(u.name.split(" ")[0])},</p>
${late.length ? `<p><b>Overdue (${late.length})</b></p><ul>${late.map(li).join("")}</ul>` : ""}
${dueToday.length ? `<p><b>Due today (${dueToday.length})</b></p><ul>${dueToday.map(li).join("")}</ul>` : ""}
${unread.length ? `<p><b>New for you</b></p><ul>${unread.map((n) => `<li>${n.link ? `<a href="${base}${n.link}">${escapeHtml(n.title)}</a>` : escapeHtml(n.title)}</li>`).join("")}</ul>` : ""}
<p><a href="${base}/my">Open My work</a></p>
<p style="color:#78809a;font-size:12px">Tejas Work Tracker. You get this when something is due or new for you.</p></div>`;
    const text = [
      `Good morning ${u.name.split(" ")[0]},`,
      late.length ? `Overdue: ${late.map((t) => `T-${t.number} ${t.title}`).join("; ")}` : "",
      dueToday.length ? `Due today: ${dueToday.map((t) => `T-${t.number} ${t.title}`).join("; ")}` : "",
      unread.length ? `New for you: ${unread.map((n) => n.title).join("; ")}` : "",
      `${base}/my`,
    ].filter(Boolean).join("\n");
    try {
      await sendMail(u.email, `${late.length ? `${late.length} overdue, ` : ""}${dueToday.length} due today: Work Tracker`, html, text);
      if (unread.length) await db().update(schema.notifications).set({ emailedAt: new Date() }).where(inArray(schema.notifications.id, unread.map((n) => n.id)));
      sent++;
    } catch (e) {
      console.error("digest", u.email, e);
      failed++;
    }
  }
  await setMeta("digest-result", { date: today, sent, failed, at: isoDate(new Date()) });
  void getMeta;
  return { sent, failed };
}
