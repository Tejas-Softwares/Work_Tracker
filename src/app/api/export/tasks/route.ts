import { currentViewer } from "@/lib/auth/session";
import { getOrg } from "@/lib/org";
import { listTasks, parseFilters } from "@/lib/data/tasks";
import { STATUS_LABEL, PRIORITY_LABEL, SOURCE_LABEL, isOverdue, wasOnTime } from "@/lib/domain/tasks";
import { diffDays, isoDate, todayISO } from "@/lib/domain/dates";
import { addTable, newBook, xlsxResponse } from "@/lib/excel/reports";

export async function GET(request: Request) {
  const v = await currentViewer();
  if (!v) return new Response("Sign in first.", { status: 401 });
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const org = await getOrg();
  const rows = await listTasks(v, parseFilters(sp), 5000);
  const today = todayISO();
  const wb = newBook();
  addTable(
    wb,
    "Tasks",
    `Tasks, downloaded ${today} by ${v.name}`,
    [
      { header: "No.", width: 8 },
      { header: "Task", width: 50 },
      { header: "Owner", width: 22 },
      { header: "Department", width: 20 },
      { header: "Project", width: 18 },
      { header: "Status", width: 13 },
      { header: "Priority", width: 10 },
      { header: "Due", width: 12, numFmt: "dd-mmm-yyyy" },
      { header: "Days late", width: 10 },
      { header: "Done on", width: 12, numFmt: "dd-mmm-yyyy" },
      { header: "On time", width: 9 },
      { header: "Times moved", width: 11 },
      { header: "Came from", width: 20 },
      { header: "Given by", width: 20 },
      { header: "Blocked by", width: 36 },
    ],
    rows.map((t) => [
      t.number,
      t.title,
      org.byId.get(t.ownerId)?.name ?? "",
      t.departmentId ? org.deptById.get(t.departmentId)?.name ?? "" : "",
      t.project,
      STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status,
      PRIORITY_LABEL[t.priority as keyof typeof PRIORITY_LABEL] ?? t.priority,
      t.dueDate ? new Date(`${t.dueDate}T00:00:00Z`) : null,
      isOverdue(t, today) ? diffDays(t.dueDate!, today) : null,
      t.completedAt ? new Date(`${isoDate(t.completedAt)}T00:00:00Z`) : null,
      wasOnTime(t) === null ? "" : wasOnTime(t) ? "Yes" : "No",
      t.slips || null,
      SOURCE_LABEL[t.source as keyof typeof SOURCE_LABEL] ?? t.source,
      t.createdBy ? org.byId.get(t.createdBy)?.name ?? "" : "",
      t.status === "blocked" ? t.blockedReason : "",
    ]),
  );
  return xlsxResponse(wb, `Tejas_Tasks_${today}.xlsx`);
}
