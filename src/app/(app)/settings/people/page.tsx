import { getOrg } from "@/lib/org";
import { PeopleManager } from "@/components/settings/PeopleManager";

export const metadata = { title: "People" };

export default async function PeopleSettings() {
  const org = await getOrg();
  return (
    <PeopleManager
      people={org.people.map((p) => ({
        id: p.id,
        name: p.name,
        designation: p.designation,
        departmentId: p.departmentId,
        reportsTo: p.reportsTo,
        email: p.email ?? "",
        phone: p.phone ?? "",
        isVacancy: p.isVacancy,
        active: p.active,
        rolePurpose: p.rolePurpose,
        behaviours: p.behaviours,
        dottedLine: p.dottedLine,
        joinedOn: p.joinedOn ?? "",
        reports: (org.reports.get(p.id) ?? []).length,
      }))}
      departments={org.departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
