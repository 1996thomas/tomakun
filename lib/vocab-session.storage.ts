import type { JLPTLevel } from "@/types/vocab";

export type SavedVocabSession = {
  studyMode: "career" | "free";
  targetLevel: JLPTLevel;
  isCumulativeMode: boolean;
  setSize: number;
  sessionIds: string[];
  sessionIndex: number;
  showMeaning: boolean;
  sessionCorrect: number;
  sessionWrong: number;
  savedAt: string;
};

const STORAGE_KEY = "tomakun.vocab.session.v1";
export const VOCAB_SESSION_EVENT = "tomakun:vocab-session-sync";

export function loadSavedVocabSession(): SavedVocabSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedVocabSession;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function saveVocabSession(session: SavedVocabSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(VOCAB_SESSION_EVENT));
}

export function clearVocabSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(VOCAB_SESSION_EVENT));
}
