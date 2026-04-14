"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RoutineNavStatus from "@/components/layout/RoutineNavStatus";

const NAV_ITEMS = [
  { href: "/kana", label: "Katakana" },
  { href: "/hiragana", label: "Hiragana" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="surface-card sticky top-0 z-20 border-x-0 border-t-0">
      <nav className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 shrink items-center gap-2">
          <Link href="/" className="shrink-0 text-sm font-bold tracking-wide">
            TOMAKUN
          </Link>
          <RoutineNavStatus />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={`${item.href}?mode=free&series=short`}
                className={[
                  "rounded-md px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm",
                  isActive ? "btn-primary" : "btn-option",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
