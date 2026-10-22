import { getSettings } from "@/lib/settings";
import { RulesForm } from "@/components/settings/RulesForm";

export const metadata = { title: "Rules" };

export default async function RulesPage() {
  const s = await getSettings();
  return <RulesForm settings={s} />;
}
