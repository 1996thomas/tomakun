import type { ReviewRating, VocabProgressItem } from "@/types/vocab-progress";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysFromNow(days: number, now: Date): string {
  return new Date(now.getTime() + days * MS_PER_DAY).toISOString();
}

export function createInitialProgress(id: string, level: VocabProgressItem["level"]): VocabProgressItem {
  const now = new Date().toISOString();
  return {
    id,
    level,
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    ease: 2.3,
    intervalDays: 0,
    nextReviewAt: now,
    lastReviewedAt: now,
  };
}

export function applyReview(
  current: VocabProgressItem,
  rating: ReviewRating,
  now = new Date(),
): VocabProgressItem {
  const seenCount = current.seenCount + 1;
  const isSuccess = rating === "good" || rating === "easy";
  const correctCount = current.correctCount + (isSuccess ? 1 : 0);
  const wrongCount = current.wrongCount + (isSuccess ? 0 : 1);
  const streak = isSuccess ? current.streak + 1 : 0;

  let ease = current.ease;
  let interval = current.intervalDays;

  if (rating === "again") {
    ease = clamp(ease - 0.25, MIN_EASE, MAX_EASE);
    interval = 1;
  } else if (rating === "hard") {
    ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
    interval = Math.max(1, Math.round(Math.max(1, interval) * 1.2));
  } else if (rating === "good") {
    interval = interval <= 0 ? 2 : Math.round(Math.max(1, interval) * ease);
  } else {
    ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
    interval = interval <= 0 ? 4 : Math.round(Math.max(1, interval) * (ease + 0.2));
  }

  return {
    ...current,
    seenCount,
    correctCount,
    wrongCount,
    streak,
    ease,
    intervalDays: interval,
    nextReviewAt: daysFromNow(interval, now),
    lastReviewedAt: now.toISOString(),
  };
}
