import type { Metadata } from "next";
import VocabFlashcards from "@/features/vocab-flashcards/VocabFlashcards";

export const metadata: Metadata = {
  title: "Japanese vocabulary practice – JLPT flashcards trainer",
  description:
    "Drill Japanese vocabulary with short flashcard sessions and spaced repetition. Practice JLPT-style words, track your streak and build reading confidence.",
  openGraph: {
    title: "Japanese vocabulary practice – JLPT flashcards trainer",
    description:
      "Fast Japanese vocab drills with flashcards, SRS-style review and clear stats, ideal for daily JLPT practice.",
    type: "article",
    url: "/vocab/",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Japanese vocabulary practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Japanese vocabulary practice – JLPT flashcards trainer",
    description:
      "Fast Japanese vocab drills with flashcards, SRS-style review and clear stats, ideal for daily JLPT practice.",
    images: ["/android-chrome-512x512.png"],
  },
  alternates: {
    canonical: "/vocab/",
    languages: {
      en: "/vocab/",
      fr: "/vocab/",
    },
  },
};

export default function VocabPage() {
  return <VocabFlashcards />;
}
