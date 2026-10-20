"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/", "Today"],
  ["/log", "Log"],
  ["/history", "History"],
  ["/settings", "Settings"],
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="sticky bottom-0 border-t border-track bg-surface">
      <ul className="grid grid-cols-4">
        {TABS.map(([href, label]) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground ${
                  active ? "font-semibold text-foreground" : "text-muted"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
