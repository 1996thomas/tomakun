import type { Metadata } from "next";
import HiraganaPageClient from "./HiraganaPageClient";

export const metadata: Metadata = {
  title: "Hiragana practice – Quick Japanese kana quiz",
  description:
    "Practice Japanese hiragana with fast multiple-choice quizzes, instant feedback and endless practice loops. Ideal for beginners and JLPT N5 learners.",
  openGraph: {
    title: "Hiragana practice – Quick Japanese kana quiz",
    description:
      "Train your hiragana recognition with short, focused quizzes and one-question-at-a-time feedback, built for daily Japanese practice.",
    type: "article",
  },
  alternates: {
    canonical: "/hiragana",
    languages: {
      en: "/hiragana",
    },
  },
};

export default function HiraganaPage() {
  return <HiraganaPageClient />;
}
