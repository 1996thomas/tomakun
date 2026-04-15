import type { TrainingModule } from "@/lib/training-status.storage";

export const RESUME_SAVED_SET_EVENT = "tomakun:resume-saved-set";

export function requestResumeSavedSet(module: TrainingModule): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ module: TrainingModule }>(RESUME_SAVED_SET_EVENT, {
      detail: { module },
    }),
  );
}
