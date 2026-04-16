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
  },
  alternates: {
    canonical: "/vocab",
    languages: {
      en: "/vocab",
    },
  },
};

export default function VocabPage() {
  return <VocabFlashcards />;
}
