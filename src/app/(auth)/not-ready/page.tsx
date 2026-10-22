import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/db";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Not ready yet" };

export default function NotReadyPage() {
  if (hasDatabase()) redirect("/login");
  return (
    <AuthCard title="Not ready yet" sub="The app is online but no database is connected.">
      <ol className="grid list-decimal gap-2 pl-5 text-[14px] text-ink-2">
        <li>In Vercel, open this project, then <b>Storage</b>.</li>
        <li>
          Click <b>Create Database</b>, choose <b>Neon</b>, the <b>Free</b> plan and the region <b>Singapore</b>, then <b>Connect</b>.
        </li>
        <li>
          Open <b>Deployments</b>, click the three dots on the top one, then <b>Redeploy</b>.
        </li>
        <li>Come back here. You&apos;ll see the setup page.</li>
      </ol>
    </AuthCard>
  );
}
