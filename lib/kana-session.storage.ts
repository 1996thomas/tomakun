type Series = "short" | "medium" | "long";

export type SavedKanaSession = {
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

const STORAGE_KEY = "tomakun.kana.session.v1";
export const KANA_SESSION_EVENT = "tomakun:kana-session-sync";

export function loadSavedKanaSession(): SavedKanaSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedKanaSession;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function saveKanaSession(session: SavedKanaSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(KANA_SESSION_EVENT));
}

export function clearKanaSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(KANA_SESSION_EVENT));
}
