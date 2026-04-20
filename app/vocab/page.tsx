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
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Japanese vocabulary practice - TOMAKUN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Japanese vocabulary practice – JLPT flashcards trainer",
    description:
      "Fast Japanese vocab drills with flashcards, SRS-style review and clear stats, ideal for daily JLPT practice.",
    images: ["/twitter-image"],
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
