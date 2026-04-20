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
    url: "/kana/",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Kana practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kana practice – Hiragana & Katakana quiz",
    description:
      "Fast Japanese kana drills to train Hiragana and Katakana recognition with one-question-at-a-time feedback.",
    images: ["/android-chrome-512x512.png"],
  },
  alternates: {
    canonical: "/kana/",
    languages: {
      en: "/kana/",
      fr: "/kana/",
    },
  },
};

export default function KanaPage() {
  return <KanaPageClient />;
}
