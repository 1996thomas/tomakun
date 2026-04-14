"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TrainingProgress from "@/components/progress/TrainingProgress";
import {
  getRoutineRunContextForModule,
  loadRoutineBundle,
  parseRoutineSeries,
  resolveFreeSessionTarget,
  trackRoutineModuleCompletion,
} from "@/lib/routine.storage";
import { generateKanaQuestion } from "./kana.logic";

const NEXT_QUESTION_DELAY_MS = 700;

function routineModeMessage(reason: string): string {
  switch (reason) {
    case "no_plan":
      return "Aucune routine enregistree. Cree-la depuis l'accueil.";
    case "no_run":
      return "Demarre ta routine depuis l'accueil (bouton Lancer).";
    case "wrong_scope":
      return "Ce module n'est pas inclus dans ta routine.";
    case "not_in_progress":
      return "Routine terminee ou en pause. Relance depuis l'accueil.";
    case "stale_run":
      return "Routine obsolete. Enregistre ou relance depuis l'accueil.";
    default:
      return "";
  }
}

export default function KanaQuiz() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const isRoutineMode = mode === "routine";
  const freeSeries = useMemo(
    () => parseRoutineSeries(searchParams.get("series")),
    [searchParams],
  );

  const [question, setQuestion] = useState(() => generateKanaQuestion());
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [routineTick, setRoutineTick] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const endAfterThisFeedbackRef = useRef(false);

  const routineCtx = useMemo(() => {
    void routineTick;
    return getRoutineRunContextForModule("katakana");
  }, [routineTick]);
  const routineLinked = isRoutineMode && routineCtx.canTrack;

  const sessionGoal = useMemo(() => {
    if (!isRoutineMode) {
      return resolveFreeSessionTarget(freeSeries, "katakana");
    }
    const series = routineCtx.bundle.plan?.features.katakana?.series ?? "short";
    return resolveFreeSessionTarget(series, "katakana");
  }, [isRoutineMode, freeSeries, routineCtx.bundle.plan]);

  const isCorrect = selectedAnswer
    ? selectedAnswer === question.correctAnswer
    : null;
  const accuracy =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  const progressTitle = routineLinked ? "Progression routine" : "Progression session";
  const progressCurrent = routineLinked
    ? (routineCtx.bundle.run?.doneCount ?? 0)
    : Math.min(answeredCount, sessionGoal);
  const progressGoal = routineLinked
    ? (routineCtx.bundle.run?.targetCount ?? 1)
    : sessionGoal;

  function resetFreeSession(): void {
    setSessionEnded(false);
    setAnsweredCount(0);
    setCorrectCount(0);
    setWrongCount(0);
    setSelectedAnswer(null);
    setQuestion(generateKanaQuestion());
    endAfterThisFeedbackRef.current = false;
  }

  function handleAnswerSelect(option: string): void {
    if (selectedAnswer || sessionEnded) return;
    const correct = option === question.correctAnswer;
    const nextAnswered = answeredCount + 1;

    let stopAfterFeedback = false;
    if (routineLinked) {
      trackRoutineModuleCompletion("katakana");
      setRoutineTick((t) => t + 1);
      const bundle = loadRoutineBundle();
      stopAfterFeedback =
        bundle.run?.status === "completed" || nextAnswered >= sessionGoal;
    } else {
      stopAfterFeedback = nextAnswered >= sessionGoal;
    }

    endAfterThisFeedbackRef.current = stopAfterFeedback;
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
        setQuestion(generateKanaQuestion());
      }
    }, NEXT_QUESTION_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [selectedAnswer]);

  if (sessionEnded) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-center text-sm font-semibold">
            {isRoutineMode
              ? routineCtx.bundle.run?.status === "completed"
                ? "Routine du jour terminee"
                : "Bloc katakana termine"
              : "Serie terminee"}
          </p>
          <p className="text-muted mt-1 text-center text-xs">
            {isRoutineMode && routineCtx.bundle.run?.status === "in_progress"
              ? `Il reste ${Math.max(0, (routineCtx.bundle.run.targetCount ?? 0) - (routineCtx.bundle.run.doneCount ?? 0))} question(s) dans ta routine.`
              : "Voici le bilan de cette session sur cet ecran."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{answeredCount}</p>
              <p className="text-muted text-xs">Reponses</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-[var(--success)]">{correctCount}</p>
              <p className="text-muted text-xs">Correctes</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-[var(--danger)]">{wrongCount}</p>
              <p className="text-muted text-xs">Erreurs</p>
            </div>
            <div className="surface-card rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{accuracy}%</p>
              <p className="text-muted text-xs">Precision</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {!isRoutineMode && (
              <button
                type="button"
                onClick={resetFreeSession}
                className="btn-primary h-10 w-full rounded-lg text-sm font-medium"
              >
                Nouvelle serie
              </button>
            )}
            {isRoutineMode && (
              <Link
                href="/routine"
                className="btn-primary flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
              >
                {routineCtx.bundle.run?.status === "completed"
                  ? "Retour a l'accueil routine"
                  : "Continuer ma routine"}
              </Link>
            )}
            <Link
              href="/"
              className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
            >
              Accueil
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        {isRoutineMode && !routineLinked && (
          <p
            className={
              routineCtx.reason === "not_in_progress" &&
              routineCtx.bundle.run?.status === "completed"
                ? "text-muted mb-3 text-center text-xs"
                : "feedback-wrong mb-3 text-center text-xs"
            }
          >
            {routineCtx.reason === "not_in_progress" &&
            routineCtx.bundle.run?.status === "completed"
              ? "Routine terminee. Tu peux continuer, sans mise a jour du compteur."
              : routineModeMessage(routineCtx.reason)}
          </p>
        )}
        {isRoutineMode && routineLinked && routineCtx.bundle.run && (
          <p className="text-muted mb-3 text-center text-xs">
            {routineCtx.bundle.run.status === "in_progress"
              ? `Routine en cours: ${routineCtx.bundle.run.doneCount}/${routineCtx.bundle.run.targetCount}`
              : `Routine terminee: ${routineCtx.bundle.run.doneCount}/${routineCtx.bundle.run.targetCount}`}
          </p>
        )}
        {!isRoutineMode && (
          <p className="text-muted mb-3 text-center text-xs">
            Entrainement libre - serie {freeSeries === "short" ? "10" : freeSeries === "medium" ? "30" : "Full"}
          </p>
        )}

        <TrainingProgress
          title={progressTitle}
          current={progressCurrent}
          goal={progressGoal}
          stats={[
            { label: "Reponses", value: answeredCount },
            { label: "Correctes", value: correctCount },
            { label: "Erreurs", value: wrongCount },
            { label: "Precision", value: `${accuracy}%` },
          ]}
        />

        <p className="text-muted text-center text-sm">Quel est ce katakana ?</p>
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

        <p className="mt-4 h-6 text-center text-sm font-medium">
          {isCorrect === true && <span className="feedback-correct">Correct</span>}
          {isCorrect === false && (
            <span className="feedback-wrong">
              Incorrect — {question.correctAnswer}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
