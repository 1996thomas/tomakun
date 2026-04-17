"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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

  return (
    <div className={`flex h-7 items-center justify-center ${className}`.trim()} aria-live="polite">
      {tone === "success" && (
        <span className="feedback-chip feedback-chip-success animate-feedback-pop">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {resolvedSuccessLabel}
        </span>
      )}
      {tone === "error" && (
        <span className="feedback-chip feedback-chip-error animate-feedback-pop">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {resolvedErrorLabel}
        </span>
      )}
    </div>
  );
}
