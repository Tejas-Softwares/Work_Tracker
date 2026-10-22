import { requireViewer, ROLE_LABEL } from "@/lib/auth/session";
import { getOrg } from "@/lib/org";
import { PageHeader } from "@/components/ui/bits";
import { AccountForms } from "@/components/settings/AccountForms";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const v = await requireViewer();
  const org = await getOrg();
  const p = v.personId ? org.byId.get(v.personId) : undefined;
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="My account" sub={`${v.email}, ${ROLE_LABEL[v.role]}${p ? `, linked to ${p.name}` : ", not linked to the team list"}`} />
      <AccountForms name={v.name} phone={p?.phone ?? ""} linked={!!p} />
    </div>
  );
}
