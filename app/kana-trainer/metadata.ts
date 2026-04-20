import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kana Trainer – Configure your Japanese kana practice sets",
  description:
    "Choose Hiragana or Katakana and configure short, medium or full practice sets before starting your Japanese kana drills.",
  openGraph: {
    title: "Kana Trainer – Configure your Japanese kana practice sets",
    description:
      "Set up Hiragana and Katakana practice sessions with different set sizes, then jump into fast kana quizzes.",
    type: "article",
    url: "/kana-trainer/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Kana trainer - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kana Trainer – Configure your Japanese kana practice sets",
    description:
      "Set up Hiragana and Katakana practice sessions with different set sizes, then jump into fast kana quizzes.",
    images: ["/twitter-image"],
  },
  alternates: {
    canonical: "/kana-trainer/",
    languages: {
      en: "/kana-trainer/",
      fr: "/kana-trainer/",
    },
  },
};

