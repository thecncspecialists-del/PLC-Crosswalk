"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/transcripts", label: "Transcripts" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1 border-b-2 pb-0.5 ${
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-700 hover:text-slate-900"
            }`}
          >
            <span>{item.label}</span>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-slate-900" : "bg-transparent"}`}
            />
          </Link>
        );
      })}
    </>
  );
}
