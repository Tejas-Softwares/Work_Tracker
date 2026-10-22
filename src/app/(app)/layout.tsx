import { after } from "next/server";
import { and, asc, inArray } from "drizzle-orm";
import { requireViewer, ROLE_LABEL } from "@/lib/auth/session";
import { getOrg, managedIds, isHR } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { myCounts, projectsInUse } from "@/lib/data/tasks";
import { db, schema } from "@/lib/db";
import { todayISO } from "@/lib/domain/dates";
import { Shell } from "@/components/shell/Shell";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { runDailyJobIfDue } from "@/lib/jobs/daily";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  const [org, settings, counts, projects, initiatives] = await Promise.all([
    getOrg(),
    getSettings(),
    myCounts(v),
    projectsInUse(v),
    db()
      .select({ id: schema.initiatives.id, name: schema.initiatives.name })
      .from(schema.initiatives)
      .where(and(inArray(schema.initiatives.status, ["planned", "active"])))
      .orderBy(asc(schema.initiatives.name)),
  ]);
  // The daily job (repeating tasks, escalations, reminders, backup) also runs on the first visit of the day,
  // after the page has been sent, in case the scheduled run was missed.
  after(() => runDailyJobIfDue().catch((e) => console.error("daily job", e)));

  const person = v.personId ? org.byId.get(v.personId) : undefined;
  const people = org.active.map((p) => ({
    id: p.id,
    name: p.name,
    designation: p.designation,
    dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "",
    vacancy: p.isVacancy,
  }));

  return (
    <Shell
      user={{ name: person?.name ?? v.name, email: v.email, role: v.role, roleLabel: person?.designation || ROLE_LABEL[v.role], linked: !!person, personName: person?.name ?? null }}
      counts={counts}
      access={{
        manager: managedIds(org, v).size > 0,
        hr: isHR(v),
        admin: v.role === "admin",
        management: v.role === "management" || v.role === "admin",
      }}
      company={settings.company.shortName}
      quickAdd={<QuickAdd people={people} me={v.personId} today={todayISO()} workingDays={settings.rules.workingDays} initiatives={initiatives} projects={projects} />}
    >
      {children}
    </Shell>
  );
}
