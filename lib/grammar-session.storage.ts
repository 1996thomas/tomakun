import type { JLPTLevel } from "@/types/vocab";
import type { GrammarPoint } from "@/types/grammar";
import type { GrammarQuestion, GrammarSessionProgress } from "@/features/grammar-trainer/grammar.logic";

export type SavedGrammarSession = {
  targetLevel: JLPTLevel;
  isCumulative: boolean;
  setSize: number;
  session: GrammarPoint[];
  progress: GrammarSessionProgress;
  question: GrammarQuestion | null;
  savedAt: string;
};

const STORAGE_KEY = "tomakun.grammar.session.v1";
export const GRAMMAR_SESSION_EVENT = "tomakun:grammar-session-sync";

export function loadSavedGrammarSession(): SavedGrammarSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGrammarSession;
    if (!parsed || !Array.isArray(parsed.session)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGrammarSession(session: SavedGrammarSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(GRAMMAR_SESSION_EVENT));
}

export function clearGrammarSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(GRAMMAR_SESSION_EVENT));
}
