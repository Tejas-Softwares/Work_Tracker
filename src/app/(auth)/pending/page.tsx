import Link from "next/link";
import { AuthCard } from "../AuthCard";

export const metadata = { title: "Waiting for approval" };

export default function PendingPage() {
  return (
    <AuthCard title="Waiting for approval" sub="An admin has been told. Once they approve your account, sign in with the email and password you chose.">
      <Link href="/login" className="btn">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
