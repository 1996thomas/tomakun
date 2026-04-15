"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";

function QuizLoading() {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        <p className="text-muted text-center text-sm">{t("loading.quiz")}</p>
      </div>
    </section>
  );
}

const HiraganaQuiz = dynamic(() => import("@/features/hiragana-quiz/HiraganaQuiz"), {
  ssr: false,
  loading: () => <QuizLoading />,
});

export default function HiraganaPageClient() {
  return <HiraganaQuiz />;
}
