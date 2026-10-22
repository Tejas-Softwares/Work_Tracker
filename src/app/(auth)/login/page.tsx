import { redirect } from "next/navigation";
import Link from "next/link";
import { hasDatabase } from "@/lib/db";
import { hasUsers } from "@/lib/actions/auth";
import { currentViewer } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/AuthForms";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDatabase()) redirect("/not-ready");
  if (!(await hasUsers())) redirect("/setup");
  if (await currentViewer()) redirect("/my");
  const { next = "" } = await searchParams;
  return (
    <AuthCard title="Sign in" sub="Use your work email and password.">
      <LoginForm next={next} />
      <p className="mt-8 text-center text-[12px] text-ink-3">
        Admin locked out? <Link href="/recover" className="underline">Use the setup code</Link>
      </p>
    </AuthCard>
  );
}
