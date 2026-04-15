"use client";

import { CheckCircle2, XCircle } from "lucide-react";

type FeedbackTone = "success" | "error" | null;

type AnswerFeedbackProps = {
  tone: FeedbackTone;
  successLabel?: string;
  errorLabel?: string;
  className?: string;
};

export default function AnswerFeedback({
  tone,
  successLabel = "Correct",
  errorLabel = "Incorrect",
  className = "",
}: AnswerFeedbackProps) {
  return (
    <div className={`flex h-7 items-center justify-center ${className}`.trim()} aria-live="polite">
      {tone === "success" && (
        <span className="feedback-chip feedback-chip-success animate-feedback-pop">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {successLabel}
        </span>
      )}
      {tone === "error" && (
        <span className="feedback-chip feedback-chip-error animate-feedback-pop">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {errorLabel}
        </span>
      )}
    </div>
  );
}
