import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tejas Work Tracker", template: "%s · Tejas Work Tracker" },
  description: "Tasks, roles and reviews for the Tejas Group office.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Work Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#23305a",
  width: "device-width",
  initialScale: 1,
};

// Every page depends on who is signed in, and each response carries a fresh nonce for its scripts,
// so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
