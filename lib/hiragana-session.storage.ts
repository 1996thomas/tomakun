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

export function loadSavedHiraganaSession(): SavedHiraganaSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedHiraganaSession;
    return parsed ?? null;
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
