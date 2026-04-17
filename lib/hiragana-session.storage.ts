type Series = "short" | "medium" | "long";

export type SavedHiraganaSession = {
  series: Series;
  question: {
    kana: string;
    options: string[];
    correctAnswer: string;
  };
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  sessionGoal: number;
  savedAt: string;
};

const STORAGE_KEY = "tomakun.hiragana.session.v1";
export const HIRAGANA_SESSION_EVENT = "tomakun:hiragana-session-sync";

function isValidSeries(value: unknown): value is Series {
  return value === "short" || value === "medium" || value === "long";
}

function isValidQuestion(value: unknown): value is SavedHiraganaSession["question"] {
  if (!value || typeof value !== "object") return false;
  const question = value as {
    kana?: unknown;
    options?: unknown;
    correctAnswer?: unknown;
  };
  return (
    typeof question.kana === "string" &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    question.options.every((opt) => typeof opt === "string") &&
    typeof question.correctAnswer === "string"
  );
}

export function loadSavedHiraganaSession(): SavedHiraganaSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedHiraganaSession>;
    if (!parsed || !isValidSeries(parsed.series) || !isValidQuestion(parsed.question)) return null;
    if (
      typeof parsed.answeredCount !== "number" ||
      typeof parsed.correctCount !== "number" ||
      typeof parsed.wrongCount !== "number" ||
      typeof parsed.sessionGoal !== "number"
    ) {
      return null;
    }
    if (
      parsed.answeredCount < 0 ||
      parsed.correctCount < 0 ||
      parsed.wrongCount < 0 ||
      parsed.sessionGoal <= 0
    ) {
      return null;
    }
    if (typeof parsed.savedAt !== "string") return null;
    return {
      series: parsed.series,
      question: parsed.question,
      answeredCount: parsed.answeredCount,
      correctCount: parsed.correctCount,
      wrongCount: parsed.wrongCount,
      sessionGoal: parsed.sessionGoal,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveHiraganaSession(session: SavedHiraganaSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(HIRAGANA_SESSION_EVENT));
}

export function clearHiraganaSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(HIRAGANA_SESSION_EVENT));
}
