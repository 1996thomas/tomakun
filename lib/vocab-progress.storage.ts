import type { VocabProgressMap } from "@/types/vocab-progress";

const STORAGE_KEY = "tomakun.vocab.progress.v1";

export function loadVocabProgress(): VocabProgressMap {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as VocabProgressMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function saveVocabProgress(progress: VocabProgressMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
