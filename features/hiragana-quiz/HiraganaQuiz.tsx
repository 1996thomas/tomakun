"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import AnswerFeedback from "@/components/feedback/AnswerFeedback";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { clearTrainingStatus, saveTrainingStatus } from "@/lib/training-status.storage";
import {
  clearHiraganaSession,
  loadSavedHiraganaSession,
  saveHiraganaSession,
} from "@/lib/hiragana-session.storage";
import { RESUME_SAVED_SET_EVENT } from "@/lib/saved-set.events";
import { HIRAGANA_DATA } from "./hiragana.data";
import { generateHiraganaQuestion } from "./hiragana.logic";

const NEXT_QUESTION_DELAY_MS = 700;

type Series = "short" | "medium" | "long";

function parseSeries(value: string | null): Series {
  if (value === "medium" || value === "long") return value;
  return "short";
}

function resolveSessionGoal(series: Series): number {
  if (series === "short") return 10;
  if (series === "medium") return 30;
  return HIRAGANA_DATA.length;
}

export default function HiraganaQuiz() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const series = useMemo(() => parseSeries(searchParams.get("series")), [searchParams]);
  const shouldResume = useMemo(() => searchParams.get("resume") === "saved", [searchParams]);
  const resumeSession = useMemo(
    () => (shouldResume ? loadSavedHiraganaSession() : null),
    [shouldResume],
  );
  const sessionGoal = useMemo(() => resolveSessionGoal(series), [series]);

  const [question, setQuestion] = useState(() => resumeSession?.question ?? generateHiraganaQuestion());
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(() => resumeSession?.answeredCount ?? 0);
  const [correctCount, setCorrectCount] = useState(() => resumeSession?.correctCount ?? 0);
  const [wrongCount, setWrongCount] = useState(() => resumeSession?.wrongCount ?? 0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const endAfterThisFeedbackRef = useRef(false);

  const isCorrect = selectedAnswer ? selectedAnswer === question.correctAnswer : null;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  function resetSession(): void {
    clearHiraganaSession();
    setSessionEnded(false);
    setIsStopped(false);
    setAnsweredCount(0);
    setCorrectCount(0);
    setWrongCount(0);
    setSelectedAnswer(null);
    setQuestion(generateHiraganaQuestion());
    endAfterThisFeedbackRef.current = false;
  }

  function handleAnswerSelect(option: string): void {
    if (selectedAnswer || sessionEnded || isStopped) return;

    const correct = option === question.correctAnswer;
    const nextAnswered = answeredCount + 1;

    endAfterThisFeedbackRef.current = nextAnswered >= sessionGoal;
    setSelectedAnswer(option);
    setAnsweredCount(nextAnswered);

    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
    }
  }

  useEffect(() => {
    if (!selectedAnswer) return;

    const timeout = setTimeout(() => {
      const stop = endAfterThisFeedbackRef.current;
      endAfterThisFeedbackRef.current = false;
      setSelectedAnswer(null);

      if (stop) {
        setSessionEnded(true);
      } else {
        setQuestion(generateHiraganaQuestion());
      }
    }, NEXT_QUESTION_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [selectedAnswer]);

  function restoreSavedSession(): void {
    const saved = loadSavedHiraganaSession();
    if (!saved) return;
    setQuestion(saved.question);
    setAnsweredCount(saved.answeredCount);
    setCorrectCount(saved.correctCount);
    setWrongCount(saved.wrongCount);
    setSessionEnded(false);
    setIsStopped(false);
    setSelectedAnswer(null);
    endAfterThisFeedbackRef.current = false;
    clearHiraganaSession();
  }

  useEffect(() => {
    if (shouldResume && resumeSession) clearHiraganaSession();
  }, [resumeSession, shouldResume]);

  function saveAndStopSession(): void {
    saveHiraganaSession({
      series,
      question,
      answeredCount,
      correctCount,
      wrongCount,
      sessionGoal,
      savedAt: new Date().toISOString(),
    });
    setShowStopModal(false);
    setIsStopped(true);
    setSelectedAnswer(null);
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  function stopWithoutSaving(): void {
    clearHiraganaSession();
    setShowStopModal(false);
    setIsStopped(true);
    setSelectedAnswer(null);
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  useEffect(() => {
    saveTrainingStatus({
      module: "hiragana",
      label: `Hiragana ${series === "short" ? "10" : series === "medium" ? "30" : "Full"}`,
      current: Math.min(answeredCount, sessionGoal),
      goal: sessionGoal,
      correct: correctCount,
      wrong: wrongCount,
      accuracy,
      sessionEnded,
      isActive: !sessionEnded && !isStopped,
    });
  }, [accuracy, answeredCount, correctCount, isStopped, wrongCount, series, sessionEnded, sessionGoal]);

  useEffect(() => {
    if (sessionEnded) clearHiraganaSession();
  }, [sessionEnded]);

  useEffect(() => {
    const onResumeRequest = (event: Event) => {
      const custom = event as CustomEvent<{ module: "hiragana" }>;
      if (custom.detail?.module !== "hiragana") return;
      restoreSavedSession();
    };
    window.addEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
    return () => {
      window.removeEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
      clearTrainingStatus();
    };
  }, []);

  useEffect(() => {
    const hasActiveSet = !sessionEnded && !isStopped;
    if (!hasActiveSet) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;

      const url = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (url.origin !== current.origin) return;
      if (url.pathname === current.pathname && url.search === current.search) return;

      event.preventDefault();
      setPendingNavigationHref(url.pathname + url.search + url.hash);
      setShowStopModal(true);
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [isStopped, sessionEnded]);

  if (sessionEnded) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-center text-sm font-semibold">{t("quiz.seriesDone")}</p>
          <p className="text-muted mt-1 text-center text-xs">
            {t("quiz.seriesDoneDesc")}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{answeredCount}</p>
              <p className="text-muted text-xs">{t("quiz.answers")}</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-[var(--success)]">{correctCount}</p>
              <p className="text-muted text-xs">{t("quiz.correct")}</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-[var(--danger)]">{wrongCount}</p>
              <p className="text-muted text-xs">{t("quiz.errors")}</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{accuracy}%</p>
              <p className="text-muted text-xs">{t("quiz.accuracy")}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={resetSession}
              className="btn-primary h-10 w-full rounded-lg text-sm font-medium"
            >
              {t("quiz.newSeries")}
            </button>
            <Link
              href="/"
              className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
            >
              {t("quiz.home")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (isStopped) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-center text-sm font-semibold">{t("quiz.stopped")}</p>
          <p className="text-muted mt-1 text-center text-xs">
            {t("quiz.stoppedDesc")}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" onClick={resetSession} className="h-10 w-full rounded-lg text-sm font-medium">
              {t("quiz.newSeries")}
            </Button>
            <Link
              href="/kana-trainer"
              className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
            >
              {t("quiz.backKanaTrainer")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-muted text-xs">
            {t("quiz.freeTrainingSeries", {
              size: series === "short" ? "10" : series === "medium" ? "30" : t("common.full"),
            })}
          </p>
          <button
            type="button"
            onClick={() => setShowStopModal(true)}
            className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
            aria-label={t("quiz.closeSeries")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-muted text-center text-sm">{t("quiz.whatHiragana")}</p>
        <div className="my-6 text-center text-7xl font-bold">{question.kana}</div>

        <div className="grid grid-cols-2 gap-3">
          {question.options.map((option) => {
            const isSelected = selectedAnswer === option;
            const showCorrect = selectedAnswer && option === question.correctAnswer;
            const showWrong = isSelected && isCorrect === false;

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleAnswerSelect(option)}
                disabled={Boolean(selectedAnswer)}
                className={[
                  "btn-option h-12 rounded-lg text-base font-medium transition",
                  "disabled:cursor-not-allowed disabled:opacity-80",
                  isSelected ? "btn-primary" : "",
                  showCorrect ? "state-correct" : "",
                  showWrong ? "state-wrong" : "",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>

        <AnswerFeedback
          className="mt-4"
          tone={isCorrect === null ? null : isCorrect ? "success" : "error"}
          errorLabel={`Incorrect - ${question.correctAnswer}`}
        />

      </div>

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">{t("quiz.stopSeriesTitle")}</p>
            <p className="text-muted mt-1 text-xs">
              {t("quiz.stopSeriesDesc")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button type="button" onClick={saveAndStopSession} className="h-10 rounded-lg text-sm font-medium">
                {t("quiz.saveAndQuit")}
              </Button>
              <Button type="button" variant="outline" onClick={stopWithoutSaving} className="h-10 rounded-lg text-sm font-medium">
                {t("quiz.quitWithoutSaving")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowStopModal(false);
                  setPendingNavigationHref(null);
                }}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("quiz.continueSeries")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
