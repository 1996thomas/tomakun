import type { JLPTLevel } from "@/types/vocab";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type VocabProgressItem = {
  id: string;
  level: JLPTLevel;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
  ease: number;
  intervalDays: number;
  nextReviewAt: string;
  lastReviewedAt: string;
};

export type VocabProgressMap = Record<string, VocabProgressItem>;
