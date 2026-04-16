import type { Metadata } from "next";
import KanaPageClient from "@/app/kana/KanaPageClient";

export const metadata: Metadata = {
  title: "Kana practice – Hiragana & Katakana quiz",
  description:
    "Practice Japanese kana (Hiragana and Katakana) with quick multiple-choice quizzes, instant feedback and short training sets.",
  openGraph: {
    title: "Kana practice – Hiragana & Katakana quiz",
    description:
      "Fast Japanese kana drills to train Hiragana and Katakana recognition with one-question-at-a-time feedback.",
    type: "article",
  },
  alternates: {
    canonical: "/kana",
    languages: {
      en: "/kana",
    },
  },
};

export default function KanaPage() {
  return <KanaPageClient />;
}
