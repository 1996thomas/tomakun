"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/layout/ThemeToggle";

const NAV_ITEMS = [
  { href: "/kana?series=short", pathPrefix: "/kana", label: "Katakana" },
  { href: "/hiragana?series=short", pathPrefix: "/hiragana", label: "Hiragana" },
  { href: "/vocab", pathPrefix: "/vocab", label: "Vocab" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="surface-card sticky top-0 z-20 border-x-0 border-t-0">
      <nav className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <Link href="/" className="text-sm font-bold tracking-wide">
          TOMAKUN
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm",
                  isActive ? "btn-primary" : "btn-option",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
