import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { getOrg, isHR, managedIds } from "@/lib/org";
import { addDays, todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/bits";
import { PlanForm } from "@/components/plans/PlanForm";

export const metadata = { title: "Start an improvement plan" };

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  const v = await requireViewer();
  const org = await getOrg();
  const managed = managedIds(org, v);
  if (!isHR(v) && managed.size === 0) redirect("/my");
  const people = org.active
    .filter((p) => !p.isVacancy && p.id !== v.personId && (isHR(v) || managed.has(p.id)))
    .map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "" }));
  const today = todayISO();
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader back={{ href: "/plans", label: "Improvement plans" }} title="Start an improvement plan" sub="Be specific. The plan is shared with the person, and the record decides the outcome." />
      <PlanForm people={people} personId={person && people.some((p) => p.id === person) ? person : null} start={today} end={addDays(today, 60)} />
    </div>
  );
}
