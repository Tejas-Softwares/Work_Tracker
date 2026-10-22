import { RecoverForm } from "@/components/auth/AuthForms";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Admin recovery" };

export default function RecoverPage() {
  return (
    <AuthCard title="Admin recovery" sub="For an admin who has forgotten their password. You need the SETUP_CODE from Vercel.">
      <RecoverForm />
    </AuthCard>
  );
}
