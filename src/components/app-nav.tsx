"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, FileText, LayoutDashboard, ListOrdered, Settings, Upload, Receipt } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/upload", label: "Upload", icon: Upload },
  { href: "/app/statements", label: "Statements", icon: Receipt },
  { href: "/app/transactions", label: "Transactions", icon: ListOrdered },
  { href: "/app/insights", label: "Insights", icon: BarChart3 },
  { href: "/app/report", label: "Annual report", icon: FileText },
  { href: "/app/billing", label: "Plan & billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  return (
    <nav aria-label="App" className="relative">
      <button
        type="button"
        className="min-h-11 rounded-[8px] border border-border px-3 text-sm font-semibold lg:hidden"
        aria-expanded={open}
        aria-controls="app-nav-list"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      <ul
        id="app-nav-list"
        className={cn(
          "absolute right-0 top-12 z-20 w-56 flex-col gap-1 rounded-[14px] border border-border bg-surface p-2 shadow-lg lg:static lg:flex lg:w-auto lg:border-0 lg:p-0 lg:shadow-none",
          open ? "flex" : "hidden",
        )}
      >
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-[15px] font-medium no-underline",
                isActive(href) ? "bg-brand-soft text-brand-strong" : "text-ink hover:bg-surface-2",
              )}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
        <li className="border-t border-border pt-1 lg:hidden">
          <form action="/auth/signout" method="post">
            <button type="submit" className="flex min-h-11 w-full items-center rounded-[8px] px-3 text-[15px] font-medium hover:bg-surface-2">
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
