"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CircleHelp, Sparkles, X } from "lucide-react";
import type { JLPTLevel } from "@/types/vocab";
import type { GrammarPoint } from "@/types/grammar";
import AnswerFeedback from "@/components/feedback/AnswerFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { clearTrainingStatus, saveTrainingStatus } from "@/lib/training-status.storage";
import {
  GRAMMAR_SESSION_EVENT,
  clearGrammarSession,
  loadSavedGrammarSession,
  saveGrammarSession,
} from "@/lib/grammar-session.storage";
import { RESUME_SAVED_SET_EVENT } from "@/lib/saved-set.events";
import {
  createQuestion,
  createSession,
  getGrammarPool,
  isCorrectAnswer,
  updateProgress,
  type GrammarQuestion,
  type GrammarSessionProgress,
} from "@/features/grammar-trainer/grammar.logic";
import { useI18n } from "@/lib/i18n";
import { clearRewardToast } from "@/lib/reward-toast";
import type { GrammarExplainRequest, GrammarExplainResult } from "@/types/grammar-ai";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const SET_SIZES = [5, 10, 20, 30] as const;

type GrammarAiQuota = {
  dailyMax: number;
  dailyUsed: number;
  dailyRemaining: number;
  dailyResetInSeconds: number;
};

const grammarLevelLoaders: Record<JLPTLevel, () => Promise<GrammarPoint[]>> = {
  N5: () => import("@/data/processed/grammar_n5.json").then((mod) => mod.default as GrammarPoint[]),
  N4: () => import("@/data/processed/grammar_n4.json").then((mod) => mod.default as GrammarPoint[]),
  N3: () => import("@/data/processed/grammar_n3.json").then((mod) => mod.default as GrammarPoint[]),
  N2: () => import("@/data/processed/grammar_n2.json").then((mod) => mod.default as GrammarPoint[]),
  N1: () => import("@/data/processed/grammar_n1.json").then((mod) => mod.default as GrammarPoint[]),
};

const INITIAL_PROGRESS: GrammarSessionProgress = {
  index: 0,
  total: 0,
  correct: 0,
  wrong: 0,
};

const QUESTION_UI: Record<
  GrammarQuestion["type"],
  {
    badgeKey: string;
    badgeClass: string;
    expectedKey: string;
  }
> = {
  meaning_from_structure: {
    badgeKey: "grammar.type.meaning",
    badgeClass: "border-[var(--success)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]",
    expectedKey: "grammar.expected.meaning",
  },
  structure_from_meaning: {
    badgeKey: "grammar.type.structure",
    badgeClass: "border-[var(--primary)] text-[var(--foreground)] bg-[var(--surface-2)]",
    expectedKey: "grammar.expected.structure",
  },
  structure_from_example: {
    badgeKey: "grammar.type.usage",
    badgeClass: "border-[#3b82f6] text-[#3b82f6] bg-[color-mix(in_srgb,#3b82f6_12%,transparent)]",
    expectedKey: "grammar.expected.usage",
  },
};

function splitExampleRomaji(rawExample: string): { jp: string; romaji: string } {
  const text = rawExample.trim();
  const match = text.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!match) return { jp: text, romaji: "" };
  return {
    jp: match[1].trim(),
    romaji: match[2].trim(),
  };
}

let cachedSavedRaw: string | null | undefined;
let cachedSavedSnapshot = loadSavedGrammarSession();

function getSavedSessionSnapshot() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("tomakun.grammar.session.v1");
  if (raw === cachedSavedRaw) return cachedSavedSnapshot;
  cachedSavedRaw = raw;
  cachedSavedSnapshot = loadSavedGrammarSession();
  return cachedSavedSnapshot;
}

export default function GrammarTrainer() {
  const { t, locale } = useI18n();
  const [targetLevel, setTargetLevel] = useState<JLPTLevel>("N5");
  const [loadedGrammarByLevel, setLoadedGrammarByLevel] =
    useState<Partial<Record<JLPTLevel, GrammarPoint[]>>>({});
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isCumulative, setIsCumulative] = useState(true);
  const [setSize, setSetSize] = useState<number>(10);
  const [session, setSession] = useState<GrammarPoint[]>([]);
  const [progress, setProgress] = useState<GrammarSessionProgress>(INITIAL_PROGRESS);
  const [question, setQuestion] = useState<GrammarQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [showHelper, setShowHelper] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const [showExplanationPanel, setShowExplanationPanel] = useState(false);
  const [isAnswerRevealedByAI, setIsAnswerRevealedByAI] = useState(false);
  const [hasRequestedExplanationForQuestion, setHasRequestedExplanationForQuestion] = useState(false);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<GrammarExplainResult | null>(null);
  const [aiQuota, setAiQuota] = useState<GrammarAiQuota | null>(null);
  const loadedRef = useRef<Partial<Record<JLPTLevel, GrammarPoint[]>>>({});
  const inFlightRef = useRef<Partial<Record<JLPTLevel, Promise<GrammarPoint[]>>>>({});

  const savedSession = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === "tomakun.grammar.session.v1" || e.key === null) onStoreChange();
      };
      const onLocal = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(GRAMMAR_SESSION_EVENT, onLocal);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(GRAMMAR_SESSION_EVENT, onLocal);
      };
    },
    getSavedSessionSnapshot,
    () => null,
  );

  useEffect(() => {
    loadedRef.current = loadedGrammarByLevel;
  }, [loadedGrammarByLevel]);

  const ensureGrammarLevelsLoaded = useCallback(async (levels: JLPTLevel[]) => {
    const jobs: Array<[JLPTLevel, Promise<GrammarPoint[]>]> = [];
    for (const level of levels) {
      if (loadedRef.current[level] !== undefined) continue;
      const existingJob = inFlightRef.current[level];
      if (existingJob) {
        jobs.push([level, existingJob]);
        continue;
      }
      const createdJob = grammarLevelLoaders[level]();
      inFlightRef.current[level] = createdJob;
      jobs.push([level, createdJob]);
    }
    if (jobs.length === 0) return;

    setIsLoadingLevels(true);
    setLoadError(false);

    const results = await Promise.allSettled(jobs.map(([, job]) => job));
    const entries: Array<readonly [JLPTLevel, GrammarPoint[]]> = [];
    let hasError = false;
    for (let i = 0; i < results.length; i += 1) {
      const level = jobs[i][0];
      const result = results[i];
      delete inFlightRef.current[level];
      if (result.status === "fulfilled") {
        entries.push([level, result.value] as const);
      } else {
        hasError = true;
      }
    }
    if (entries.length > 0) {
      setLoadedGrammarByLevel((prev) => {
        const next = { ...prev };
        for (const [level, data] of entries) next[level] = data;
        return next;
      });
    }
    setLoadError(hasError);
    setIsLoadingLevels(false);
  }, []);

  useEffect(() => {
    const neededLevels = isCumulative ? LEVELS.slice(0, LEVELS.indexOf(targetLevel) + 1) : [targetLevel];
    queueMicrotask(() => {
      void ensureGrammarLevelsLoaded(neededLevels);
    });
  }, [ensureGrammarLevelsLoaded, isCumulative, targetLevel]);

  const pool = useMemo(
    () =>
      getGrammarPool(
        {
          N5: loadedGrammarByLevel.N5 ?? [],
          N4: loadedGrammarByLevel.N4 ?? [],
          N3: loadedGrammarByLevel.N3 ?? [],
          N2: loadedGrammarByLevel.N2 ?? [],
          N1: loadedGrammarByLevel.N1 ?? [],
        },
        targetLevel,
        isCumulative,
      ),
    [isCumulative, loadedGrammarByLevel, targetLevel],
  );

  const current = session[progress.index] ?? null;
  const inSession = session.length > 0 && progress.index < session.length;
  const isDone = session.length > 0 && progress.index >= session.length;

  function startTraining(): void {
    clearGrammarSession();
    const nextSession = createSession(pool, setSize);
    const first = nextSession[0];
    setSession(nextSession);
    setProgress({
      index: 0,
      total: nextSession.length,
      correct: 0,
      wrong: 0,
    });
    setSelected(null);
    setFeedback(null);
    setQuestion(first ? createQuestion(first, pool) : null);
    setIsAnswerRevealedByAI(false);
    setHasRequestedExplanationForQuestion(false);
    setShowExplanationPanel(false);
    setExplanation(null);
    setExplanationError(null);
    setIsLoadingExplanation(false);
  }

  function confirmStartTraining(): void {
    if (savedSession) {
      setShowOverwriteModal(true);
      return;
    }
    startTraining();
  }

  function stopTraining(): void {
    setSession([]);
    setProgress(INITIAL_PROGRESS);
    setQuestion(null);
    setSelected(null);
    setFeedback(null);
    setShowStopModal(false);
    setIsAnswerRevealedByAI(false);
    setHasRequestedExplanationForQuestion(false);
    setShowExplanationPanel(false);
    setExplanation(null);
    setExplanationError(null);
    setIsLoadingExplanation(false);
  }

  const resumeSavedSession = useCallback((): void => {
    if (!savedSession) return;
    setTargetLevel(savedSession.targetLevel);
    setIsCumulative(savedSession.isCumulative);
    setSetSize(savedSession.setSize);
    setSession(savedSession.session);
    setProgress(savedSession.progress);
    setQuestion(savedSession.question);
    setSelected(null);
    setFeedback(null);
  }, [savedSession]);

  function saveAndQuitSession(): void {
    if (!inSession) return;
    saveGrammarSession({
      targetLevel,
      isCumulative,
      setSize,
      session,
      progress,
      question,
      savedAt: new Date().toISOString(),
    });
    stopTraining();
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  function discardAndQuitSession(): void {
    clearGrammarSession();
    stopTraining();
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  function handleAnswer(choice: string): void {
    if (!question || !inSession || selected) return;
    const ok = isCorrectAnswer(question, choice);
    setSelected(choice);
    setFeedback(ok ? "correct" : "wrong");
    setIsAnswerRevealedByAI(false);
    setHasRequestedExplanationForQuestion(false);
    setShowExplanationPanel(false);
    setExplanation(null);
    setExplanationError(null);

    window.setTimeout(() => {
      moveToNextQuestion(ok);
    }, 650);
  }

  function moveToNextQuestion(isCorrect: boolean | null): void {
    clearRewardToast();
    const nextProgress =
      isCorrect === null
        ? {
            index: progress.index + 1,
            total: progress.total,
            correct: progress.correct,
            wrong: progress.wrong,
          }
        : updateProgress(progress, isCorrect);
    const nextItem = session[nextProgress.index] ?? null;
    setProgress(nextProgress);
    setSelected(null);
    setFeedback(null);
    setQuestion(nextItem ? createQuestion(nextItem, pool) : null);
    setIsAnswerRevealedByAI(false);
    setHasRequestedExplanationForQuestion(false);
    setShowExplanationPanel(false);
    setExplanation(null);
    setExplanationError(null);
    setIsLoadingExplanation(false);
  }

  async function requestExplanation(): Promise<void> {
    if (!question || !current || isLoadingExplanation || hasRequestedExplanationForQuestion) return;
    setIsAnswerRevealedByAI(true);
    setHasRequestedExplanationForQuestion(true);
    setShowExplanationPanel(true);
    setIsLoadingExplanation(true);
    setExplanationError(null);

    try {
      const payload: GrammarExplainRequest = {
        locale,
        question,
        current,
        selectedChoice: selected,
      };
      const response = await fetch("/api/ai/grammar-explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        explanation?: GrammarExplainResult;
        quota?: GrammarAiQuota;
        error?: string;
      };
      if (data.quota) setAiQuota(data.quota);
      if (!response.ok || !data.explanation) {
        throw new Error(data.error ?? "Failed to explain");
      }
      setExplanation(data.explanation);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("grammar.ai.error");
      setExplanationError(message || t("grammar.ai.error"));
    } finally {
      setIsLoadingExplanation(false);
    }
  }

  useEffect(() => {
    if (!inSession) return;
    let cancelled = false;
    const fetchQuota = async () => {
      try {
        const response = await fetch("/api/ai/grammar-explain", { method: "GET", cache: "no-store" });
        const data = (await response.json()) as { quota?: GrammarAiQuota };
        if (!cancelled && data.quota) setAiQuota(data.quota);
      } catch {
        // no-op: quota is informative only
      }
    };
    void fetchQuota();
    return () => {
      cancelled = true;
    };
  }, [inSession, progress.index]);

  function formatDuration(seconds: number): string {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
    return `${secs}s`;
  }

  useEffect(() => {
    const inProgress = inSession && progress.total > 0;
    const accuracy =
      progress.correct + progress.wrong > 0
        ? Math.round((progress.correct / (progress.correct + progress.wrong)) * 100)
        : 0;

    saveTrainingStatus({
      module: "grammar",
      label: "grammar.trainer",
      current: Math.min(progress.index, progress.total),
      goal: progress.total,
      correct: progress.correct,
      wrong: progress.wrong,
      accuracy,
      sessionEnded: isDone,
      isActive: inProgress,
    });
  }, [inSession, isDone, progress.correct, progress.index, progress.total, progress.wrong]);

  useEffect(() => {
    if (isDone) clearGrammarSession();
  }, [isDone]);

  useEffect(() => {
    return () => {
      clearTrainingStatus();
    };
  }, []);

  useEffect(() => {
    const onResumeRequest = (event: Event) => {
      const custom = event as CustomEvent<{ module: "grammar" }>;
      if (custom.detail?.module !== "grammar") return;
      resumeSavedSession();
    };
    window.addEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
    return () => window.removeEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
  }, [resumeSavedSession]);

  useEffect(() => {
    if (!inSession) return;

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
  }, [inSession]);

  return (
    <section className="flex flex-1 flex-col justify-center">
      <Card className="p-4">
        <CardContent>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("grammar.header.title")}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHelper(true)}
              className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
              aria-label={t("grammar.header.showHelpAria")}
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </button>
            {inSession && (
              <button
                type="button"
                onClick={() => setShowStopModal(true)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label={t("grammar.session.closeSetAria")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="text-muted mt-1 text-xs">
          {t("grammar.header.subtitle")}
        </p>
        {isLoadingLevels && (
          <p className="text-muted mt-1 text-xs">
            {t("grammar.loading.exercises")}
          </p>
        )}
        {loadError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("common.error.loadData")}
          </p>
        )}

        {!inSession && !isDone && (
          <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{t("common.poolMode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => setIsCumulative(true)}
                  variant={isCumulative ? "default" : "outline"}
                  className="h-9 rounded-lg text-xs font-medium transition"
                >
                  {t("common.cumulative")}
                </Button>
                <Button
                  type="button"
                  onClick={() => setIsCumulative(false)}
                  variant={!isCumulative ? "default" : "outline"}
                  className="h-9 rounded-lg text-xs font-medium transition"
                >
                  {t("common.specificLevel")}
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">
                {isCumulative ? t("common.targetCumulativeLevel") : t("common.targetLevel")}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.map((level) => (
                  <Button
                    key={level}
                    type="button"
                    onClick={() => setTargetLevel(level)}
                    variant={level === targetLevel ? "default" : "outline"}
                    className="h-9 rounded-lg text-xs font-medium transition"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{t("common.setSize")}</p>
              <div className="grid grid-cols-4 gap-2">
                {SET_SIZES.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    onClick={() => setSetSize(size)}
                    variant={size === setSize ? "default" : "outline"}
                    className="h-9 rounded-lg text-xs font-medium transition"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{pool.length}</p>
                <p className="text-muted text-[11px]">{t("grammar.stats.availablePoints")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{Math.min(setSize, pool.length)}</p>
                <p className="text-muted text-[11px]">{t("grammar.stats.questionsInSet")}</p>
              </div>
            </div>

            <Button
              type="button"
              onClick={confirmStartTraining}
              disabled={pool.length === 0 || isLoadingLevels}
              className="mt-4 flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {t("grammar.action.startTraining")}
            </Button>

            {pool.length === 0 && (
              <p className="text-muted mt-2 text-xs">
                {t("grammar.emptyData")}
              </p>
            )}
          </>
        )}

        {inSession && current && question && (
          <>
            <div className="surface-card mt-4 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted text-xs">
                  {t("common.level")} {current.level} - {t("grammar.question.label")} {progress.index + 1}/{progress.total}
                </p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI[question.type].badgeClass}`}
                >
                  {t(QUESTION_UI[question.type].badgeKey)}
                </span>
              </div>

              {question.type === "meaning_from_structure" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{t("grammar.type.structure")}</p>
                  <p className="mt-1 text-2xl font-bold">{current.structure}</p>
                </>
              )}

              {question.type === "structure_from_meaning" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{t("grammar.type.meaning")}</p>
                  <p className="text-muted mt-1 text-sm">{current.meaning}</p>
                </>
              )}

              {question.type === "structure_from_example" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{t("grammar.type.example")}</p>
                  <p className="mt-1 text-sm">{splitExampleRomaji(current.example).jp}</p>
                  {splitExampleRomaji(current.example).romaji && (
                    <p className="text-muted mt-1 text-xs">{splitExampleRomaji(current.example).romaji}</p>
                  )}
                  <p className="text-muted mt-1 text-xs">{current.exampleMeaning}</p>
                </>
              )}
            </div>

            <div className="surface-card mt-3 rounded-lg p-3">
              <p className="text-xs font-semibold">{question.prompt}</p>
              <p className="text-muted mt-1 text-[11px]">{t(QUESTION_UI[question.type].expectedKey)}</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {question.choices.map((choice) => {
                  const isRight = question.answer === choice;
                  const isSelected = selected === choice;
                  const revealByAI = isAnswerRevealedByAI && selected === null;
                  const stateClass =
                    revealByAI
                      ? isRight
                        ? "state-correct"
                        : "btn-option opacity-70"
                      : selected === null
                        ? "btn-option"
                      : isRight
                        ? "state-correct"
                        : isSelected
                          ? "state-wrong"
                          : "btn-option opacity-70";
                  return (
                    <Button
                      key={choice}
                      variant="outline"
                      type="button"
                      onClick={() => handleAnswer(choice)}
                      disabled={selected !== null || isAnswerRevealedByAI}
                      className={`h-10 rounded-lg px-3 text-left text-sm font-medium transition ${stateClass}`}
                    >
                      {choice}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestExplanation}
                  disabled={
                    isLoadingExplanation ||
                    selected !== null ||
                    hasRequestedExplanationForQuestion ||
                    (aiQuota !== null && aiQuota.dailyRemaining <= 0)
                  }
                  className="h-8 rounded-md px-2.5 text-[11px] font-medium inline-flex items-center gap-1"
                >
                  {isLoadingExplanation ? (
                    <span className="ai-spinner" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {aiQuota !== null && aiQuota.dailyRemaining <= 0
                    ? t("grammar.ai.dailyBlocked")
                    : isLoadingExplanation
                    ? t("grammar.ai.loading")
                    : hasRequestedExplanationForQuestion
                      ? t("grammar.ai.used")
                      : t("grammar.ai.cta")}
                </Button>
              </div>
            </div>

            {showExplanationPanel && (
              <div className="surface-card animate-ai-panel-in mt-3 rounded-lg border border-[var(--border)]/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden="true" />
                    {t("grammar.ai.title")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowExplanationPanel(false)}
                    className="btn-option inline-flex h-7 w-7 items-center justify-center rounded-md"
                    aria-label={t("grammar.ai.close")}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-muted mt-1 text-[11px]">{t("grammar.ai.subtitle")}</p>
                {isLoadingExplanation && (
                  <div className="mt-2 space-y-2">
                    <div className="ai-skeleton-line h-3 w-2/5" />
                    <div className="ai-skeleton-line h-3 w-full" />
                    <div className="ai-skeleton-line h-3 w-4/5" />
                    <div className="ai-skeleton-line h-3 w-3/5" />
                  </div>
                )}
                {explanationError && (
                  <p className="mt-2 text-xs text-[var(--danger)]">{explanationError}</p>
                )}
                {explanation && (
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
                      <p className="font-semibold">{t("grammar.ai.ruleSummary")}</p>
                      <p className="text-muted mt-1">{explanation.ruleSummary}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{t("grammar.ai.whyCorrect")}</p>
                      <p className="text-muted mt-1">{explanation.whyThisIsCorrect}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{t("grammar.ai.commonMistake")}</p>
                      <p className="text-muted mt-1">{explanation.whyCommonMistake}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{t("grammar.ai.extraExample")}</p>
                      <p className="mt-1">{explanation.extraExampleJp}</p>
                      <p className="text-muted mt-1">{explanation.extraExampleRomaji}</p>
                      <p className="text-muted mt-1">{explanation.extraExampleTranslation}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{t("grammar.ai.memoryTip")}</p>
                      <p className="text-muted mt-1">{explanation.memoryTip}</p>
                    </div>
                    <div className="pt-1">
                      <Button
                        type="button"
                        onClick={() => moveToNextQuestion(false)}
                        className="h-9 w-full rounded-lg text-xs font-medium"
                      >
                        {t("grammar.ai.nextQuestion")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isAnswerRevealedByAI && !showExplanationPanel && (
              <div className="mt-2">
                <Button
                  type="button"
                  onClick={() => moveToNextQuestion(false)}
                  className="h-9 w-full rounded-lg text-xs font-medium"
                >
                  {t("grammar.ai.nextQuestion")}
                </Button>
              </div>
            )}
            {aiQuota && (
              <p className="text-muted mt-1 text-center text-[10px]">
                {t("grammar.ai.quotaDailyCompact", {
                  remaining: aiQuota.dailyRemaining,
                  max: aiQuota.dailyMax,
                })}{" "}
                • {t("grammar.ai.quotaDailyResetCompact", { time: formatDuration(aiQuota.dailyResetInSeconds) })}
              </p>
            )}

            <AnswerFeedback
              className="mt-2"
              tone={feedback === null ? null : feedback === "correct" ? "success" : "error"}
            />

          </>
        )}

        {isDone && (
          <>
            <div className="surface-card mt-4 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold">{t("common.setComplete")}</p>
              <p className="text-muted mt-1 text-xs">
                {progress.correct} {t("common.correct")} - {progress.wrong} {t("common.errors")}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={startTraining}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.playAgain")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={stopTraining}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.configure")}
              </Button>
            </div>
          </>
        )}
        </CardContent>
      </Card>

      {showHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("grammar.help.title")}</p>
              <button
                type="button"
                onClick={() => setShowHelper(false)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label={t("common.closeHelpAria")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-muted mt-2 text-xs">
              {t("grammar.help.overview")}
            </p>
            <p className="text-muted mt-2 text-xs">
              {t("grammar.help.questionTypes")}:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.meaning_from_structure.badgeClass}`}
              >
                {t(QUESTION_UI.meaning_from_structure.badgeKey)}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.structure_from_meaning.badgeClass}`}
              >
                {t(QUESTION_UI.structure_from_meaning.badgeKey)}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.structure_from_example.badgeClass}`}
              >
                {t(QUESTION_UI.structure_from_example.badgeKey)}
              </span>
            </div>
            <div className="text-muted mt-2 space-y-1 text-xs">
              <p>{t("grammar.help.typeMeaning")}</p>
              <p>{t("grammar.help.typeStructure")}</p>
              <p>{t("grammar.help.typeUsage")}</p>
            </div>
          </div>
        </div>
      )}

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">{t("common.stopSetTitle")}</p>
            <p className="text-muted mt-1 text-xs">
              {t("grammar.stop.desc")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button
                type="button"
                onClick={saveAndQuitSession}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.saveAndQuit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={discardAndQuitSession}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.quitWithoutSaving")}
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
                {t("common.continueSet")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showOverwriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">
              {t("common.savedExistsTitle")}
            </p>
            <p className="text-muted mt-1 text-xs">
              {t("common.savedExistsDesc")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowOverwriteModal(false);
                  resumeSavedSession();
                }}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.resumeSaved")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowOverwriteModal(false);
                  startTraining();
                }}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.restartSet")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowOverwriteModal(false)}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
