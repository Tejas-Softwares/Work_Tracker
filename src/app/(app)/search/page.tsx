import Link from "next/link";
import { Suspense } from "react";
import { desc, ilike, or } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, seesEverything } from "@/lib/org";
import { listTasks, parseFilters } from "@/lib/data/tasks";
import { db, schema } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { Avatar, PageHeader } from "@/components/ui/bits";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { toItem } from "@/components/tasks/types";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; open?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const v = await requireViewer();
  const org = await getOrg();
  const today = todayISO();
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));
  const s = q.toLowerCase();
  const [tasks, meetings, inits] = q
    ? await Promise.all([
        listTasks(v, { ...parseFilters({}), q, status: "all" }, 80),
        db().select().from(schema.meetings).where(or(ilike(schema.meetings.title, `%${q}%`), ilike(schema.meetings.notes, `%${q}%`), ilike(schema.meetings.decisions, `%${q}%`))).orderBy(desc(schema.meetings.heldOn)).limit(20),
        db().select().from(schema.initiatives).where(or(ilike(schema.initiatives.name, `%${q}%`), ilike(schema.initiatives.description, `%${q}%`))).limit(10),
      ])
    : [[], [], []];
  const visibleMeetings = seesEverything(v) ? meetings : meetings.filter((m) => m.chairPersonId === v.personId || (!!v.personId && m.attendeeIds.includes(v.personId)));
  const peopleHits = q ? org.active.filter((p) => p.name.toLowerCase().includes(s) || p.designation.toLowerCase().includes(s)) : [];
  const open = Number(sp.open);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title={q ? `Results for “${q}”` : "Search"} />
      <form action="/search" className="mb-6 flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Tasks, people, meetings, initiatives" autoFocus={!q} aria-label="Search" />
        <button className="btn btn-primary">Search</button>
      </form>
      {q && (
        <div className="grid gap-6">
          {peopleHits.length > 0 && (
            <section>
              <h2 className="section-title mb-2">People</h2>
              <ul className="flex flex-wrap gap-2">
                {peopleHits.map((p) => (
                  <li key={p.id}>
                    <Link href={`/team/${p.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-wash">
                      <Avatar name={p.name} size={26} vacancy={p.isVacancy} />
                      <span>
                        <span className="block text-[13.5px] font-semibold">{p.name}</span>
                        <span className="block text-[12px] text-ink-3">{p.designation}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="section-title mb-2">Tasks ({tasks.length})</h2>
            <Suspense>
              <TaskList items={tasks.map((r) => toItem(r, org))} today={today} people={people} group="none" emptyText="No tasks match." />
            </Suspense>
          </section>
          {inits.length > 0 && (
            <section>
              <h2 className="section-title mb-2">Initiatives</h2>
              <ul className="grid gap-1">
                {inits.map((i) => (
                  <li key={i.id}>
                    <Link className="link" href={`/initiatives/${i.id}`}>
                      {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {visibleMeetings.length > 0 && (
            <section>
              <h2 className="section-title mb-2">Meetings</h2>
              <ul className="grid gap-1">
                {visibleMeetings.map((m) => (
                  <li key={m.id}>
                    <Link className="link" href={`/meetings/${m.id}`}>
                      {m.title}
                    </Link>{" "}
                    <span className="text-[13px] text-ink-3">{formatDate(m.heldOn, today)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {Number.isInteger(open) && open > 0 && <TaskPanel number={open} closeHref={`/search?q=${encodeURIComponent(q)}`} />}
    </div>
  );
}
