"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  REWARD_TOAST_DURATION_MS,
  REWARD_TOAST_CLEAR_EVENT,
  REWARD_TOAST_EVENT,
  type RewardToastPayload,
} from "@/lib/reward-toast";

type ToastItem = RewardToastPayload & { id: string };

export default function RewardToaster() {
  const [activeToast, setActiveToast] = useState<ToastItem | null>(null);

  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => {
      setActiveToast(null);
    }, REWARD_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const custom = event as CustomEvent<RewardToastPayload>;
      const detail = custom.detail;
      if (!detail || !detail.label) return;
      setActiveToast({ ...detail, id: crypto.randomUUID() });
    };
    const onClear = () => setActiveToast(null);
    window.addEventListener(REWARD_TOAST_EVENT, onToast);
    window.addEventListener(REWARD_TOAST_CLEAR_EVENT, onClear);
    return () => {
      window.removeEventListener(REWARD_TOAST_EVENT, onToast);
      window.removeEventListener(REWARD_TOAST_CLEAR_EVENT, onClear);
    };
  }, []);

  const toneClass = useMemo(() => {
    if (!activeToast) return "";
    return activeToast.tone === "success" ? "reward-toast-success" : "reward-toast-error";
  }, [activeToast]);

  if (!activeToast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
      <div className={`reward-toast animate-reward-toast-in ${toneClass}`} role="status" aria-live="polite">
        <span className="reward-toast-content inline-flex items-center gap-1.5">
          {activeToast.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {activeToast.label}
        </span>
      </div>
    </div>
  );
}
