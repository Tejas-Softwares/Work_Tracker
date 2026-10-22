import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { Notice } from "@/components/ui/bits";
import { ImportFlow } from "@/components/settings/ImportFlow";

export const metadata = { title: "Import team" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const n = Number((await db().select({ n: count() }).from(schema.people))[0]?.n ?? 0);
  return (
    <div className="grid max-w-3xl gap-5">
      {welcome && (
        <Notice tone="good">
          You&apos;re the admin. Next: import the team workbook below, then link your own account to your name in Team and access, then send everyone the sign-up link.
        </Notice>
      )}
      <section className="panel p-5">
        <h2 className="section-title">Import the team from Excel</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">
          One workbook holds departments, people and reporting lines, KRAs, KPIs, the meeting rhythm and initiatives. You see what will change before anything is saved. Importing again updates and adds; it never deletes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn" href="/api/structure?blank=1">
            Download a blank template
          </a>
          {n > 0 && (
            <a className="btn" href="/api/structure">
              Download the current team ({n} people)
            </a>
          )}
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <ImportFlow />
        </div>
      </section>
    </div>
  );
}
