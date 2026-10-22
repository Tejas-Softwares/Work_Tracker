"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/settings/access", "Team and access"],
  ["/settings/people", "People"],
  ["/settings/departments", "Departments"],
  ["/settings/import", "Import team"],
  ["/settings/rules", "Rules"],
  ["/settings/system", "Backups and email"],
];

export function SettingsTabs() {
  const p = usePathname();
  return (
    <nav className="tabs" aria-label="Settings">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className="tab" aria-current={p === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
