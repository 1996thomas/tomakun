"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

const SERIES = ["short", "medium", "long"] as const;
type SeriesKey = (typeof SERIES)[number];

function seriesLabel(series: SeriesKey): string | null {
  if (series === "short") return "10";
  if (series === "medium") return "30";
  return null;
}

export default function KanaTrainerPage() {
  const { t } = useI18n();

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold">{t("home.kanaTitle")}</p>
        <p className="text-muted mt-1 text-xs">
          {t("kanaTrainer.description")}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-muted mb-2 text-xs font-medium">{t("kanaTrainer.katakana")}</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((series) => (
                <Link
                  key={`kata-${series}`}
                  href={`/kana?series=${series}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(series) ?? t("common.full")}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted mb-2 text-xs font-medium">{t("kanaTrainer.hiragana")}</p>
            <div className="grid grid-cols-3 gap-2">
              {SERIES.map((series) => (
                <Link
                  key={`hira-${series}`}
                  href={`/hiragana?series=${series}`}
                  className="btn-option flex h-10 items-center justify-center rounded-lg text-sm font-medium"
                >
                  {seriesLabel(series) ?? t("common.full")}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
