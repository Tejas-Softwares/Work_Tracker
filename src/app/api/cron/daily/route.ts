import { NextResponse } from "next/server";
import { cronSecret } from "@/lib/env";
import { hasDatabase } from "@/lib/db";
import { runDailyJobIfDue } from "@/lib/jobs/daily";

export const maxDuration = 60;

/** Vercel calls this once a day (vercel.json). It sends "Authorization: Bearer CRON_SECRET". */
export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 401 });
  }
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "No database" }, { status: 503 });
  const result = await runDailyJobIfDue({ fromCron: true });
  return NextResponse.json({ ok: true, result });
}
