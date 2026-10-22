import { eq } from "drizzle-orm";
import { requireViewer } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { startMeeting } from "@/lib/actions/meetings";
import { cadenceText } from "@/lib/data/meetings";
import { PageHeader } from "@/components/ui/bits";

export const metadata = { title: "Start a meeting" };

/** A confirmation step for links like "Start" on My work, so a visit alone never creates a record. */
export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ rhythm?: string }> }) {
  await requireViewer();
  const { rhythm } = await searchParams;
  const r = rhythm ? (await db().select().from(schema.meetingRhythm).where(eq(schema.meetingRhythm.id, rhythm)).limit(1))[0] : undefined;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader back={{ href: "/meetings", label: "Meetings" }} title={r ? `Start ${r.title}` : "Start a meeting"} sub={r ? `${cadenceText(r)}, ${r.durationMin} min. ${r.purpose}` : undefined} />
      <form action={startMeeting} className="grid gap-3">
        {r && <input type="hidden" name="rhythmId" value={r.id} />}
        {!r && (
          <label className="field">
            <span className="label">Meeting</span>
            <input className="input" name="title" required />
          </label>
        )}
        <button className="btn btn-primary">Start and record it</button>
      </form>
    </div>
  );
}
