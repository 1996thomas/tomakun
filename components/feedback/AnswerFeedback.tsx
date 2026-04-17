"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { clearRewardToast, emitRewardToast } from "@/lib/reward-toast";

type FeedbackTone = "success" | "error" | null;

type AnswerFeedbackProps = {
  tone: FeedbackTone;
  successLabel?: string;
  errorLabel?: string;
  className?: string;
};

export default function AnswerFeedback({
  tone,
  successLabel,
  errorLabel,
  className = "",
}: AnswerFeedbackProps) {
  const { t } = useI18n();
  const resolvedSuccessLabel = successLabel ?? t("feedback.correct");
  const resolvedErrorLabel = errorLabel ?? t("feedback.incorrect");
  const lastToneRef = useRef<FeedbackTone>(null);

  useEffect(() => {
    if (tone === null) {
      clearRewardToast();
      lastToneRef.current = tone;
      return;
    }
    if (!tone || tone === lastToneRef.current) {
      lastToneRef.current = tone;
      return;
    }
    emitRewardToast({
      tone,
      label: tone === "success" ? resolvedSuccessLabel : resolvedErrorLabel,
    });
    lastToneRef.current = tone;
  }, [resolvedErrorLabel, resolvedSuccessLabel, tone]);

  // Keep this lightweight placeholder to avoid layout jumps.
  return <div className={`h-1 ${className}`.trim()} aria-live="polite" />;
}
