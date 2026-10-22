import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getOrg } from "@/lib/org";
import { ROLE_HELP, ROLE_LABEL, ROLES } from "@/lib/auth/session";
import { AccessManager } from "@/components/settings/AccessManager";

export const metadata = { title: "Team and access" };

export default async function AccessPage() {
  const [users, org] = await Promise.all([db().select().from(schema.users).orderBy(desc(schema.users.createdAt)), getOrg()]);
  const linked = new Set(users.map((u) => u.personId).filter(Boolean));
  const people = org.active
    .filter((p) => !p.isVacancy)
    .map((p) => ({ id: p.id, name: p.name, designation: p.designation, dept: p.departmentId ? org.deptById.get(p.departmentId)?.name : "", taken: linked.has(p.id), email: p.email }));
  return (
    <AccessManager
      users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, personId: u.personId, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
      people={people}
      roles={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], help: ROLE_HELP[r] }))}
      unlinkedPeople={org.active.filter((p) => !p.isVacancy && !linked.has(p.id)).length}
    />
  );
}
