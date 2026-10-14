"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Bot,
  Kanban,
  LayoutDashboard,
  LogOut,
  PhoneCall,
  Settings,
  Users,
  Workflow,
  Megaphone,
} from "lucide-react";
import { cn } from "./ui";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/crm", label: "CRM", icon: Kanban },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ name, email }: { name?: string | null; email?: string | null }) {
  const path = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-[#f3eee4]">
      <div className="px-6 py-7">
        <Link href="/dashboard" className="serif text-2xl tracking-tight">
          Switchboard
        </Link>
        <p className="mt-1 text-xs text-[#b9aea0]">Outbound voice agents</p>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {links.map((l) => {
          const active = path === l.href || (l.href !== "/dashboard" && path.startsWith(l.href));
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-white/10 text-white" : "text-[#cfc4b6] hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={16} />
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm">{name || "Account"}</p>
        <p className="truncate text-xs text-[#b9aea0]">{email}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 flex items-center gap-2 text-xs text-[#cfc4b6] hover:text-white"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
