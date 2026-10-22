import { getOrg } from "@/lib/org";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";

export const metadata = { title: "Departments" };

export default async function DepartmentsSettings() {
  const org = await getOrg();
  return (
    <DepartmentsManager
      departments={org.departments.map((d) => ({ id: d.id, name: d.name, code: d.code, portfolio: d.portfolio, headPersonId: d.headPersonId, directorPersonId: d.directorPersonId, sort: d.sort, active: d.active, members: org.active.filter((p) => p.departmentId === d.id).length }))}
      people={org.active.map((p) => ({ id: p.id, name: p.name, designation: p.designation, vacancy: p.isVacancy }))}
    />
  );
}
