import { eq } from "drizzle-orm";
import { currentViewer } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await currentViewer();
  if (!v || v.role !== "admin") return new Response("Only an admin can download backups.", { status: 403 });
  const { id } = await params;
  const b = (await db().select().from(schema.backups).where(eq(schema.backups.id, id)).limit(1))[0];
  if (!b) return new Response("Not found", { status: 404 });
  return new Response(b.data, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="work-tracker-backup-${b.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
