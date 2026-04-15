"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import ThemeLogo from "@/components/layout/ThemeLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useI18n } from "@/lib/i18n";

const NAV_ITEMS = [
  { href: "/", pathPrefix: "/", labelKey: "nav.home" },
  { href: "/kana-trainer", pathPrefix: "/kana-trainer", labelKey: "nav.kana" },
  { href: "/vocab", pathPrefix: "/vocab", labelKey: "nav.vocab" },
  { href: "/grammar", pathPrefix: "/grammar", labelKey: "nav.grammar" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header className="surface-card sticky top-0 z-30 border-x-0 border-t-0">
      <nav className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <Link href="/" className="inline-flex items-center" aria-label={t("nav.homeAria")}>
          <ThemeLogo />
        </Link>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
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
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm",
                    isActive ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg md:hidden"
            aria-label={isMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/45 px-4 pt-16 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="surface-card w-full max-w-md rounded-xl p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{t("nav.navigation")}</p>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label={t("nav.closeMenu")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.pathPrefix === "/"
                    ? pathname === "/"
                    : pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`);
                return (
                  <Link
                    key={`mobile-${item.href}`}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={[
                      "flex h-10 items-center justify-center rounded-lg text-sm font-medium transition",
                      isActive ? "btn-primary" : "btn-option",
                    ].join(" ")}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
