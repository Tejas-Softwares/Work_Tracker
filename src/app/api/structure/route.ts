import { currentViewer } from "@/lib/auth/session";
import { structureWorkbook } from "@/lib/excel/structure";

export async function GET(request: Request) {
  const v = await currentViewer();
  if (!v || v.role !== "admin") return new Response("Only an admin can download the team workbook.", { status: 403 });
  const blank = new URL(request.url).searchParams.get("blank") === "1";
  const wb = await structureWorkbook(blank);
  const buf = await wb.xlsx.writeBuffer();
  const name = blank ? "Work_Tracker_Team_Template.xlsx" : `Tejas_Team_Structure_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
