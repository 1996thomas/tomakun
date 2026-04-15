export type TrainingModule = "kana" | "hiragana" | "vocab" | "grammar";

export type TrainingStatus = {
  module: TrainingModule;
  label: string;
  current: number;
  goal: number;
  correct: number;
  wrong: number;
  accuracy: number;
  sessionEnded: boolean;
  isActive: boolean;
};

const STORAGE_KEY = "tomakun.training.status.v1";
export const TRAINING_STATUS_EVENT = "tomakun:training-status-sync";

export function loadTrainingStatus(): TrainingStatus | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrainingStatus>;
    if (
      !parsed ||
      (parsed.module !== "kana" &&
        parsed.module !== "hiragana" &&
        parsed.module !== "vocab" &&
        parsed.module !== "grammar")
    ) {
      return null;
    }
    return {
      module: parsed.module,
      label: typeof parsed.label === "string" ? parsed.label : "",
      current: typeof parsed.current === "number" ? parsed.current : 0,
      goal: typeof parsed.goal === "number" ? parsed.goal : 0,
      correct: typeof parsed.correct === "number" ? parsed.correct : 0,
      wrong: typeof parsed.wrong === "number" ? parsed.wrong : 0,
      accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : 0,
      sessionEnded: Boolean(parsed.sessionEnded),
      isActive: Boolean(parsed.isActive),
    };
  } catch {
    return null;
  }
}

export function saveTrainingStatus(status: TrainingStatus): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  window.dispatchEvent(new Event(TRAINING_STATUS_EVENT));
}

export function clearTrainingStatus(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(TRAINING_STATUS_EVENT));
}
