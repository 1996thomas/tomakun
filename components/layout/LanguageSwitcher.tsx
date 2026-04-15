"use client";

import { setLocale, useI18n } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const { locale, t } = useI18n();

  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={[
          "inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold transition",
          locale === "en" ? "btn-primary" : "text-muted",
        ].join(" ")}
        aria-label={t("lang.switchToEn")}
      >
        {t("lang.en")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("fr")}
        className={[
          "inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold transition",
          locale === "fr" ? "btn-primary" : "text-muted",
        ].join(" ")}
        aria-label={t("lang.switchToFr")}
      >
        {t("lang.fr")}
      </button>
    </div>
  );
}

