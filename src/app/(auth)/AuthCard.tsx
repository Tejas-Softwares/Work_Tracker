import type { ReactNode } from "react";

export function AuthCard({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2.5 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="Tejas Group" className="h-8 w-auto" />
        <span className="font-bold text-navy">Work Tracker</span>
      </div>
      <h1 className="text-[24px] font-bold">{title}</h1>
      {sub && <p className="mt-1 mb-6 text-[14px] text-ink-2">{sub}</p>}
      {!sub && <div className="mb-6" />}
      {children}
    </div>
  );
}
