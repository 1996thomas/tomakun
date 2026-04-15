import type { JLPTLevel } from "@/types/vocab";

export type VocabCareerState = {
  activeLevel: JLPTLevel;
  activeStageIndex: number;
};

const STORAGE_KEY = "tomakun.vocab.career.v1";

const DEFAULT_STATE: VocabCareerState = {
  activeLevel: "N5",
  activeStageIndex: 0,
};

export function loadVocabCareerState(): VocabCareerState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<VocabCareerState>;
    const activeLevel = parsed.activeLevel;
    const activeStageIndex = parsed.activeStageIndex;
    return {
      activeLevel:
        activeLevel === "N5" ||
        activeLevel === "N4" ||
        activeLevel === "N3" ||
        activeLevel === "N2" ||
        activeLevel === "N1"
          ? activeLevel
          : "N5",
      activeStageIndex:
        typeof activeStageIndex === "number" && activeStageIndex >= 0 ? activeStageIndex : 0,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveVocabCareerState(state: VocabCareerState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
