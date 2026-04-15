"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TrainingProgress from "@/components/progress/TrainingProgress";
import { KATAKANA_DATA } from "./kana.data";
import { generateKanaQuestion } from "./kana.logic";

const NEXT_QUESTION_DELAY_MS = 700;

type Series = "short" | "medium" | "long";

function parseSeries(value: string | null): Series {
  if (value === "medium" || value === "long") return value;
  return "short";
}

function resolveSessionGoal(series: Series): number {
  if (series === "short") return 10;
  if (series === "medium") return 30;
  return KATAKANA_DATA.length;
}

export default function KanaQuiz() {
  const searchParams = useSearchParams();
  const series = useMemo(() => parseSeries(searchParams.get("series")), [searchParams]);
  const sessionGoal = useMemo(() => resolveSessionGoal(series), [series]);

  const [question, setQuestion] = useState(() => generateKanaQuestion());
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const endAfterThisFeedbackRef = useRef(false);

  const isCorrect = selectedAnswer ? selectedAnswer === question.correctAnswer : null;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  function resetSession(): void {
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
        setQuestion(generateKanaQuestion());
      }
    }, NEXT_QUESTION_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [selectedAnswer]);

  if (sessionEnded) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-center text-sm font-semibold">Serie terminee</p>
          <p className="text-muted mt-1 text-center text-xs">
            Voici le bilan de cette session sur cet ecran.
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
            <button
              type="button"
              onClick={resetSession}
              className="btn-primary h-10 w-full rounded-lg text-sm font-medium"
            >
              Nouvelle serie
            </button>
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
        <p className="text-muted mb-3 text-center text-xs">
          Entrainement libre - serie {series === "short" ? "10" : series === "medium" ? "30" : "Full"}
        </p>

        <TrainingProgress
          title="Progression session"
          current={Math.min(answeredCount, sessionGoal)}
          goal={sessionGoal}
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
            <span className="feedback-wrong">Incorrect - {question.correctAnswer}</span>
          )}
        </p>
      </div>
    </section>
  );
}
