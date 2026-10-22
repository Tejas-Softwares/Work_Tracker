import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/db";
import { hasUsers } from "@/lib/actions/auth";
import { setupCode } from "@/lib/env";
import { SetupForm } from "@/components/auth/AuthForms";
import { Notice } from "@/components/ui/bits";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  if (!hasDatabase()) redirect("/not-ready");
  if (await hasUsers()) redirect("/login");
  return (
    <AuthCard title="Set up the Work Tracker" sub="The first account is the admin. Everyone else asks for access and you approve them.">
      {!setupCode() && (
        <div className="mb-4">
          <Notice tone="warn">SETUP_CODE is not set yet. In Vercel, add it under Settings, Environment Variables (8 characters or more), then redeploy.</Notice>
        </div>
      )}
      <SetupForm />
    </AuthCard>
  );
}
