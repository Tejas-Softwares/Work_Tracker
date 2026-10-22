import Link from "next/link";
import { asc, desc, sql } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, seesEverything, managedIds } from "@/lib/org";
import { getSettings } from "@/lib/settings";
import { db, schema } from "@/lib/db";
import { compliance, cadenceText, KIND_LABEL } from "@/lib/data/meetings";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { startMeeting } from "@/lib/actions/meetings";
import { PageHeader, Empty } from "@/components/ui/bits";
import { RhythmEditor } from "@/components/meetings/RhythmEditor";
import { OneToOneStarter } from "@/components/meetings/OneToOneStarter";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const v = await requireViewer();
  const [org, settings] = await Promise.all([getOrg(), getSettings()]);
  const today = todayISO();
  const [rhythm, recent] = await Promise.all([
    db().select().from(schema.meetingRhythm).orderBy(asc(schema.meetingRhythm.sort)),
    db()
      .select({
        id: schema.meetings.id,
        title: schema.meetings.title,
        kind: schema.meetings.kind,
        heldOn: schema.meetings.heldOn,
        chairPersonId: schema.meetings.chairPersonId,
        attendeeIds: schema.meetings.attendeeIds,
        absentIds: schema.meetings.absentIds,
        actions: sql<number>`(select count(*)::int from tasks t where t.meeting_id = "meetings"."id")`,
        actionsOpen: sql<number>`(select count(*)::int from tasks t where t.meeting_id = "meetings"."id" and t.status in ('todo','in_progress','blocked'))`,
      })
      .from(schema.meetings)
      .orderBy(desc(schema.meetings.heldOn), desc(schema.meetings.createdAt))
      .limit(60),
  ]);
  const active = rhythm.filter((r) => r.active);
  const comp = await compliance(active, today, settings.rules.workingDays, 14);
  const todays = comp.filter((c) => c.dueToday);
  const mine = (r: (typeof rhythm)[number]) => r.chairPersonId === v.personId || (!!v.personId && r.departmentId === org.byId.get(v.personId)?.departmentId);
  const visibleRecent = seesEverything(v) ? recent : recent.filter((m) => m.chairPersonId === v.personId || (!!v.personId && m.attendeeIds.includes(v.personId)));
  const reports = v.personId ? [...managedIds(org, v)].map((id) => org.byId.get(id)!).filter((p) => p && p.reportsTo === v.personId && !p.isVacancy) : [];
  const people = org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", vacancy: p.isVacancy }));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Meetings" sub="Short, fixed meetings replace ad-hoc follow-up. Each one ends with its actions as tasks, with an owner and a date." />

      <section className="mb-7">
        <h2 className="section-title mb-2">Today</h2>
        {todays.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">No meetings in the rhythm today.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todays.map((c) => (
              <form key={c.rhythm.id} action={startMeeting} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <input type="hidden" name="rhythmId" value={c.rhythm.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{c.rhythm.title}</div>
                  <div className="text-[12.5px] text-ink-3">
                    {c.rhythm.time || "Any time"}, {c.rhythm.durationMin} min{c.rhythm.chairPersonId ? `, ${org.byId.get(c.rhythm.chairPersonId)?.name}` : ""}
                  </div>
                </div>
                {c.heldToday ? (
                  <button className="btn btn-sm">Open record</button>
                ) : (
                  <button className={mine(c.rhythm) ? "btn btn-sm btn-primary" : "btn btn-sm"}>Start</button>
                )}
              </form>
            ))}
          </div>
        )}
      </section>

      {reports.length > 0 && (
        <section className="mb-7">
          <h2 className="section-title mb-1">One-to-ones</h2>
          <p className="mb-2 text-[13px] text-ink-2">Monthly, 20 minutes, with each person who reports to you: KRA progress, blockers, support needed.</p>
          <OneToOneStarter people={reports.map((p) => ({ id: p.id, name: p.name }))} />
        </section>
      )}

      <section className="mb-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">The rhythm, last 14 days</h2>
          {seesEverything(v) && <RhythmEditor people={people} departments={org.departments.map((d) => ({ id: d.id, name: d.name }))} />}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>When</th>
                <th>Chair</th>
                <th className="num">Held</th>
                <th>Purpose</th>
                {seesEverything(v) && <th />}
              </tr>
            </thead>
            <tbody>
              {rhythm.map((r) => {
                const c = comp.find((x) => x.rhythm.id === r.id);
                const pct = c && c.due ? c.held / c.due : null;
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                    <td>
                      <div className="font-[550]">{r.title}</div>
                      <div className="text-[12px] text-ink-3">{KIND_LABEL[r.kind]}</div>
                    </td>
                    <td className="text-[13px] whitespace-nowrap text-ink-2">
                      {cadenceText(r)}, {r.durationMin} min
                    </td>
                    <td className="text-[13px]">{r.chairPersonId ? org.byId.get(r.chairPersonId)?.name : ""}</td>
                    <td className="num text-[13px] whitespace-nowrap" style={{ color: pct !== null && pct < 0.8 ? "var(--color-phase-y)" : undefined, fontWeight: pct !== null && pct < 0.8 ? 600 : 400 }}>
                      {!r.active ? "paused" : c && c.due ? `${c.held} of ${c.due}` : "not due"}
                    </td>
                    <td className="max-w-[320px] text-[13px] text-ink-2">{r.purpose}</td>
                    {seesEverything(v) && (
                      <td className="text-right">
                        <RhythmEditor rhythm={r} people={people} departments={org.departments.map((d) => ({ id: d.id, name: d.name }))} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">Records</h2>
          <form action={startMeeting} className="flex items-center gap-2">
            <input type="hidden" name="kind" value="other" />
            <input className="input" name="title" placeholder="Other meeting, e.g. Ather site visit" style={{ height: 32, width: 260 }} aria-label="Meeting name" />
            <button className="btn btn-sm">Start</button>
          </form>
        </div>
        {visibleRecent.length === 0 ? (
          <Empty title="No meetings recorded yet">Start today&apos;s huddle above. Its attendance, notes and actions are kept here.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meeting</th>
                  <th>Chair</th>
                  <th className="num">Present</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecent.map((m) => (
                  <tr key={m.id}>
                    <td className="text-[13px] whitespace-nowrap">{formatDate(m.heldOn, today)}</td>
                    <td>
                      <Link href={`/meetings/${m.id}`} className="font-[550] hover:text-brand">
                        {m.title}
                      </Link>
                    </td>
                    <td className="text-[13px] text-ink-2">{m.chairPersonId ? org.byId.get(m.chairPersonId)?.name : ""}</td>
                    <td className="num text-[13px]">
                      {m.attendeeIds.length - m.absentIds.length} of {m.attendeeIds.length}
                    </td>
                    <td className="num text-[13px]">
                      {m.actions}
                      {m.actionsOpen ? <span className="text-ink-3"> ({m.actionsOpen} open)</span> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

