"use client";

import dynamic from "next/dynamic";

const HiraganaQuiz = dynamic(
  () => import("@/features/hiragana-quiz/HiraganaQuiz"),
  {
    ssr: false,
    loading: () => (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-muted text-center text-sm">Chargement du quiz...</p>
        </div>
      </section>
    ),
  },
);

export default function HiraganaPageClient() {
  return <HiraganaQuiz />;
}
