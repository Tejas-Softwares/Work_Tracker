"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { markAllRead, markRead } from "@/lib/actions/tasks";
import { useAction } from "../ui/client";

export function MarkAllRead() {
  const { pending, run } = useAction();
  return (
    <button className="btn" disabled={pending} onClick={() => run(() => markAllRead())}>
      Mark all read
    </button>
  );
}

export function NotificationLink({ id, href, unread, children }: { id: string; href: string; unread: boolean; children: ReactNode }) {
  return (
    <Link href={href} className="block hover:bg-[#fafbfd]" onClick={() => unread && void markRead(id)}>
      {children}
    </Link>
  );
}
