import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/db";
import { hasUsers } from "@/lib/actions/auth";
import { SignupForm } from "@/components/auth/AuthForms";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Ask for access" };

export default async function SignupPage() {
  if (!hasDatabase()) redirect("/not-ready");
  if (!(await hasUsers())) redirect("/setup");
  return (
    <AuthCard title="Ask for access" sub="An admin approves new accounts, usually the same day.">
      <SignupForm />
    </AuthCard>
  );
}
