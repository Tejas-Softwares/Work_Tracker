import { ResetForm } from "@/components/auth/AuthForms";
import { AuthCard } from "../../AuthCard";

export const metadata = { title: "Set a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthCard title="Set a new password" sub="This link works once and lasts 24 hours.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
