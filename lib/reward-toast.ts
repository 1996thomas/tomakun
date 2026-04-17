"use client";

export type RewardToastTone = "success" | "error";

export type RewardToastPayload = {
  tone: RewardToastTone;
  label: string;
};

export const REWARD_TOAST_DURATION_MS = 2000;
export const REWARD_TOAST_EVENT = "tomakun:reward-toast";
export const REWARD_TOAST_CLEAR_EVENT = "tomakun:reward-toast-clear";

export function emitRewardToast(payload: RewardToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RewardToastPayload>(REWARD_TOAST_EVENT, { detail: payload }));
}

export function clearRewardToast(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REWARD_TOAST_CLEAR_EVENT));
}
