import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, managedIds, visibleIds, seesEverything } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { statTasks, statsBy, musterFor } from "@/lib/data/stats";
import { db, schema } from "@/lib/db";
import { isNotNull } from "drizzle-orm";
import { todayISO, monthOf, monthStart, monthEnd, recentWorkingDays } from "@/lib/domain/dates";
import { isOverdue, isOpen } from "@/lib/domain/tasks";
import { PageHeader } from "@/components/ui/bits";
import { OrgTree, type OrgNode } from "@/components/org/OrgTree";

export const metadata = { title: "Team and roles" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "tree" } = await searchParams;
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const today = todayISO();
  const month = monthOf(today);
  const visible = visibleIds(org, v);
  const ids = org.active.filter((p) => visible.has(p.id)).map((p) => p.id);
  const [tasks, muster, users] = await Promise.all([
    statTasks(ids, monthStart(month)),
    musterFor(ids, recentWorkingDays(today, 14, settings.rules.workingDays)),
    db().select({ personId: schema.users.personId }).from(schema.users).where(isNotNull(schema.users.personId)),
  ]);
  const linked = new Set(users.map((u) => u.personId));
  const stats = statsBy(tasks, (t) => t.ownerId, monthStart(month), monthEnd(month), today);
  const quiet = new Map(muster.map((m) => [m.personId, m.quietDays]));
  const openBy = new Map<string, { open: number; overdue: number }>();
  for (const t of tasks) {
    if (!isOpen(t.status)) continue;
    const o = openBy.get(t.ownerId) ?? { open: 0, overdue: 0 };
    o.open++;
    if (isOverdue(t, today)) o.overdue++;
    openBy.set(t.ownerId, o);
  }
  const nodes: OrgNode[] = org.active.map((p) => {
    const d = p.departmentId ? org.deptById.get(p.departmentId) : undefined;
    const seen = visible.has(p.id);
    return {
      id: p.id,
      name: p.name,
      designation: p.designation,
      dept: d?.name ?? "",
      deptCode: d?.code ?? "",
      vacancy: p.isVacancy,
      reportsTo: p.reportsTo,
      dotted: p.dottedLine,
      linked: linked.has(p.id),
      ...(seen ? { open: openBy.get(p.id)?.open ?? 0, overdue: openBy.get(p.id)?.overdue ?? 0, onTime: stats.get(p.id)?.onTimePct ?? null, quietDays: quiet.get(p.id) } : {}),
    };
  });
  const vacancies = org.active.filter((p) => p.isVacancy);

  return (
    <div className={view === "departments" ? "mx-auto max-w-[1100px]" : "mx-auto max-w-[1600px]"}>
      <PageHeader
        title="Team and roles"
        sub={`${org.active.filter((p) => !p.isVacancy).length} people${vacancies.length ? ` and ${vacancies.length} seats being hired` : ""}. Open anyone to see their role card${managedIds(org, v).size || seesEverything(v) ? ", work and scores" : ""}.`}
      />
      <nav className="tabs mb-4" aria-label="Team views">
        <Link href="/team" className="tab" aria-current={view !== "departments" ? "page" : undefined}>
          Reporting lines
        </Link>
        <Link href="/team?view=departments" className="tab" aria-current={view === "departments" ? "page" : undefined}>
          Departments
        </Link>
      </nav>
      {view === "departments" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {org.departments
            .filter((d) => d.active)
            .map((d) => {
              const members = org.active.filter((p) => p.departmentId === d.id);
              const head = d.headPersonId ? org.byId.get(d.headPersonId) : undefined;
              const director = d.directorPersonId ? org.byId.get(d.directorPersonId) : undefined;
              return (
                <section key={d.id} className="panel">
                  <div className="panel-head">
                    <div>
                      <h2 className="panel-title">{d.name}</h2>
                      <p className="text-[12.5px] text-ink-3">
                        {d.portfolio && `${d.portfolio}. `}
                        Head: {head ? (head.isVacancy ? `${head.name} (new hire)` : head.name) : "not set"}
                        {director ? `, director: ${director.name}` : ""}
                      </p>
                    </div>
                    <span className="num text-[13px] text-ink-3">{members.length}</span>
                  </div>
                  <ul>
                    {members.map((p) => {
                      const o = openBy.get(p.id);
                      return (
                        <li key={p.id} className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-0">
                          <Link href={`/team/${p.id}`} className="min-w-0 flex-1 hover:text-brand">
                            <span className="block truncate text-[13.5px] font-[550]">
                              {p.name}
                              {p.isVacancy ? " (new hire)" : ""}
                            </span>
                            <span className="block truncate text-[12px] text-ink-3">{p.designation}</span>
                          </Link>
                          {visible.has(p.id) && !p.isVacancy && (
                            <span className="num text-[12.5px]" style={{ color: o?.overdue ? "var(--color-phase-y)" : "var(--color-ink-3)" }}>
                              {o?.open ?? 0} open{o?.overdue ? `, ${o.overdue} late` : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
        </div>
      ) : (
        <OrgTree nodes={nodes} idleAfter={settings.rules.idleAfterDays} />
      )}
    </div>
  );
}
