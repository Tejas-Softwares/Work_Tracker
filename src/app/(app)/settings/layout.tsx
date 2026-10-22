import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/bits";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer();
  if (v.role !== "admin") redirect("/my");
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Settings" sub="Who can sign in, the team list, imports, rules and backups." />
      <SettingsTabs />
      <div className="mt-5">{children}</div>
    </div>
  );
}
