import type { TaskRow } from "@/lib/data/tasks";
import type { Org } from "@/lib/org";

/** A task as sent to the browser: plain strings instead of dates. */
export type TaskItem = {
  id: string;
  number: number;
  title: string;
  ownerId: string;
  ownerName: string;
  ownerVacancy: boolean;
  createdBy: string | null;
  deptId: string | null;
  deptCode: string;
  deptName: string;
  project: string;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  slips: number;
  updates: number;
  checksDone: number;
  checksTotal: number;
  repeating: boolean;
  blockedReason: string;
  lastActivityAt: string;
};

export function toItem(r: TaskRow, org: Org): TaskItem {
  const owner = org.byId.get(r.ownerId);
  const dept = r.departmentId ? org.deptById.get(r.departmentId) : undefined;
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    ownerId: r.ownerId,
    ownerName: owner?.name ?? "Unknown",
    ownerVacancy: owner?.isVacancy ?? false,
    createdBy: r.createdBy,
    deptId: r.departmentId,
    deptCode: dept?.code || "",
    deptName: dept?.name || "",
    project: r.project,
    priority: r.priority,
    status: r.status,
    dueDate: r.dueDate,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    slips: r.slips,
    updates: r.updates,
    checksDone: r.checksDone,
    checksTotal: r.checksTotal,
    repeating: !!r.seriesId,
    blockedReason: r.blockedReason,
    lastActivityAt: r.lastActivityAt.toISOString(),
  };
}
