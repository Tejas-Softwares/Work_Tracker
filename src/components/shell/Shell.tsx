"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  ClipboardList,
  Gauge,
  History,
  LayoutList,
  LineChart,
  ListChecks,
  Bell,
  Plus,
  Search,
  Settings,
  Target,
  Users,
  Menu,
  X,
  LogOut,
  KeyRound,
  LifeBuoy,
} from "lucide-react";
import { cx, Avatar } from "../ui/bits";
import { Toaster } from "../ui/client";
import { openQuickAdd } from "../tasks/QuickAdd";
import { logoutAction } from "@/lib/actions/auth";

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number; tone?: "warn" };
type NavGroup = { label: string; items: NavItem[] };

export type ShellProps = {
  children: ReactNode;
  user: { name: string; email: string; role: string; roleLabel: string; linked: boolean; personName: string | null };
  counts: { overdue: number; today: number; unread: number };
  access: { manager: boolean; hr: boolean; admin: boolean; management: boolean };
  company: string;
  quickAdd: ReactNode;
};

export function Shell({ children, user, counts, access, company, quickAdd }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  // close the mobile menu after moving to another page
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenu(false);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups: NavGroup[] = [
    {
      label: "Work",
      items: [
        { href: "/my", label: "My work", icon: <ListChecks size={17} />, badge: counts.overdue || undefined, tone: "warn" },
        { href: "/tasks", label: "Tasks", icon: <LayoutList size={17} /> },
        { href: "/meetings", label: "Meetings", icon: <CalendarCheck size={17} /> },
        { href: "/initiatives", label: "Initiatives", icon: <Target size={17} /> },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/team", label: "Team and roles", icon: <Users size={17} /> },
        { href: "/scorecards", label: "Scorecards", icon: <ClipboardList size={17} /> },
        ...(access.hr || access.manager ? [{ href: "/plans", label: "Improvement plans", icon: <LifeBuoy size={17} /> }] : []),
      ],
    },
    {
      label: "Numbers",
      items: [
        ...(access.manager || access.management || access.hr ? [{ href: "/dashboard", label: "Dashboard", icon: <Gauge size={17} /> }] : []),
        { href: "/kpis", label: "Department KPIs", icon: <LineChart size={17} /> },
      ],
    },
    ...(access.admin || access.management
      ? [
          {
            label: "Admin",
            items: [
              { href: "/activity", label: "Activity log", icon: <History size={17} /> },
              ...(access.admin ? [{ href: "/settings", label: "Settings", icon: <Settings size={17} /> }] : []),
            ],
          },
        ]
      : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g) =>
        g.items.length ? (
          <div key={g.label}>
            <div className="mb-1 px-3 text-[11.5px] font-semibold text-ink-3">{g.label}</div>
            <ul className="grid gap-0.5">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={isActive(it.href) ? "page" : undefined}
                    className={cx(
                      "flex h-9 items-center gap-2.5 rounded-md px-3 text-[13.5px] font-[550]",
                      isActive(it.href) ? "bg-brand-wash text-navy" : "text-ink-2 hover:bg-wash hover:text-ink",
                    )}
                  >
                    <span className={isActive(it.href) ? "text-brand" : "text-ink-3"}>{it.icon}</span>
                    <span className="flex-1">{it.label}</span>
                    {it.badge ? (
                      <span
                        className="num min-w-[20px] rounded-full px-1.5 text-center text-[11.5px] font-semibold leading-5"
                        style={{ background: "var(--color-phase-y-wash)", color: "var(--color-phase-y)" }}
                        title={`${it.badge} overdue`}
                      >
                        {it.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-white">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-line bg-white lg:flex">
        <Link href="/my" className="flex items-center gap-2.5 px-4 pt-4 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" width={30} height={27} className="h-[27px] w-auto" />
          <span className="leading-tight">
            <span className="block text-[14.5px] font-bold text-navy" style={{ fontStretch: "88%" }}>
              Work Tracker
            </span>
            <span className="block text-[11.5px] text-ink-3">{company}</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{nav}</div>
        <div className="relative border-t border-line p-2">
          <button type="button" className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-wash" onClick={() => setUserMenu((o) => !o)} aria-expanded={userMenu}>
            <Avatar name={user.name} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{user.name}</span>
              <span className="block truncate text-[12px] text-ink-3">{user.roleLabel}</span>
            </span>
          </button>
          {userMenu && <UserMenu onClose={() => setUserMenu(false)} />}
        </div>
      </aside>

      {/* Top bar */}
      <header className="no-print sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur lg:pl-[236px]">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button type="button" className="btn btn-ghost btn-icon lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <Link href="/my" className="flex items-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="Tejas" width={26} height={23} className="h-[23px] w-auto" />
          </Link>
          <form
            role="search"
            className="relative ml-1 hidden max-w-md flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = search.current?.value.trim();
              if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input ref={search} name="q" className="input pl-8" style={{ height: 34, background: "var(--color-wash)" }} placeholder="Search tasks, people, meetings" aria-label="Search" />
            <span className="kbd absolute top-1/2 right-2 -translate-y-1/2">/</span>
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/search" className="btn btn-ghost btn-icon sm:hidden" aria-label="Search">
              <Search size={18} />
            </Link>
            <Link href="/notifications" className="btn btn-ghost btn-icon relative" aria-label={`Notifications${counts.unread ? `, ${counts.unread} unread` : ""}`}>
              <Bell size={18} />
              {counts.unread > 0 && (
                <span className="num absolute top-1 right-1 min-w-[16px] rounded-full bg-phase-r px-1 text-center text-[10px] leading-4 font-semibold text-white">
                  {counts.unread > 99 ? "99+" : counts.unread}
                </span>
              )}
            </Link>
            <button type="button" className="btn btn-primary hidden sm:inline-flex" onClick={() => openQuickAdd()} title="New task (N)">
              <Plus size={16} /> New task
              <span className="kbd ml-1 border-white/40 bg-transparent text-white/80">N</span>
            </button>
          </div>
        </div>
      </header>

      {!user.linked && (
        <div className="no-print border-b border-[#f0d48f] bg-phase-y-wash px-5 py-2 text-[13px] text-[#6b4a00] lg:pl-[256px]">
          Your account isn&apos;t linked to a name on the team list yet, so tasks can&apos;t be given to you.{" "}
          {access.admin ? (
            <Link href="/settings/access" className="font-semibold underline">
              Link it in Settings
            </Link>
          ) : (
            "Ask an admin to link it."
          )}
        </div>
      )}

      <main className="px-3 pt-5 pb-24 sm:px-5 lg:pl-[256px] lg:pr-6 lg:pb-10">{children}</main>

      {/* Mobile menu */}
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-[rgb(26_34_56/0.35)]" onClick={() => setMenu(false)} />
          <div className="anim-slide absolute inset-y-0 left-0 flex w-[280px] flex-col bg-white shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-bold text-navy">Work Tracker</span>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setMenu(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2">{nav}</div>
            <div className="border-t border-line p-3">
              <div className="mb-2 flex items-center gap-2">
                <Avatar name={user.name} size={28} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">{user.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{user.email}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/account" className="btn btn-sm flex-1">
                  My account
                </Link>
                <form action={logoutAction} className="flex-1">
                  <button className="btn btn-sm w-full">Sign out</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom bar */}
      <nav aria-label="Quick" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <BottomLink href="/my" label="My work" icon={<ListChecks size={19} />} active={isActive("/my")} badge={counts.overdue} />
        <BottomLink href="/tasks" label="Tasks" icon={<LayoutList size={19} />} active={isActive("/tasks")} />
        <button type="button" onClick={() => openQuickAdd()} className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold text-brand" aria-label="New task">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-white">
            <Plus size={20} />
          </span>
        </button>
        <BottomLink href="/team" label="Team" icon={<Users size={19} />} active={isActive("/team")} />
        <BottomLink href="/meetings" label="Meetings" icon={<CalendarCheck size={19} />} active={isActive("/meetings")} />
      </nav>

      {quickAdd}
      <Toaster />
    </div>
  );
}

function BottomLink({ href, label, icon, active, badge }: { href: string; label: string; icon: ReactNode; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={cx("relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-[550]", active ? "text-navy" : "text-ink-3")} aria-current={active ? "page" : undefined}>
      {icon}
      {label}
      {badge ? (
        <span className="num absolute top-1 left-1/2 ml-2 min-w-[16px] rounded-full px-1 text-center text-[10px] leading-4 font-semibold" style={{ background: "var(--color-phase-y-mark)", color: "#3b2800" }}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  return (
    <div ref={ref} className="anim-pop absolute right-2 bottom-[calc(100%+4px)] left-2 rounded-md border border-line bg-white py-1 shadow-[var(--shadow-pop)]">
      <Link href="/account" className="flex items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-wash" onClick={onClose}>
        <KeyRound size={15} className="text-ink-3" /> My account and password
      </Link>
      <form action={logoutAction}>
        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-wash">
          <LogOut size={15} className="text-ink-3" /> Sign out
        </button>
      </form>
    </div>
  );
}
