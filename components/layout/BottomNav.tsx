"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", pathPrefix: "/", label: "Home" },
  { href: "/kana?series=short", pathPrefix: "/kana", label: "Katakana" },
  {
    href: "/hiragana?series=short",
    pathPrefix: "/hiragana",
    label: "Hiragana",
  },
  { href: "/vocab", pathPrefix: "/vocab", label: "Vocab" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="surface-card fixed right-0 bottom-0 left-0 z-20 border-x-0 border-b-0 md:hidden">
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-4 gap-2 px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.pathPrefix === "/"
              ? pathname === "/"
              : pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center justify-center rounded-lg text-sm font-medium transition",
                isActive ? "btn-primary" : "btn-option",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
