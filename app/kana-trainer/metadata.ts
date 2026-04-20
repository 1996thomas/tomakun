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
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Kana trainer - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kana Trainer – Configure your Japanese kana practice sets",
    description:
      "Set up Hiragana and Katakana practice sessions with different set sizes, then jump into fast kana quizzes.",
    images: ["/android-chrome-512x512.png"],
  },
  alternates: {
    canonical: "/kana-trainer/",
    languages: {
      en: "/kana-trainer/",
      fr: "/kana-trainer/",
    },
  },
};

