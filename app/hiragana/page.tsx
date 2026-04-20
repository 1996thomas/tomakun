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
    url: "/hiragana/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Hiragana practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hiragana practice – Quick Japanese kana quiz",
    description:
      "Train your hiragana recognition with short, focused quizzes and one-question-at-a-time feedback, built for daily Japanese practice.",
    images: ["/twitter-image"],
  },
  alternates: {
    canonical: "/hiragana/",
    languages: {
      en: "/hiragana/",
      fr: "/hiragana/",
    },
  },
};

export default function HiraganaPage() {
  return <HiraganaPageClient />;
}
