"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CircleHelp, X } from "lucide-react";
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

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const SET_SIZES = [5, 10, 20, 30] as const;

const grammarByLevel: Record<JLPTLevel, GrammarPoint[]> = {
  N5: [],
  N4: [],
  N3: [],
  N2: [],
  N1: [],
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
    badge: string;
    badgeClass: string;
    expected: string;
  }
> = {
  meaning_from_structure: {
    badge: "Sens",
    badgeClass: "border-[var(--success)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]",
    expected: "Reponse attendue: choisis le bon sens.",
  },
  structure_from_meaning: {
    badge: "Structure",
    badgeClass: "border-[var(--primary)] text-[var(--foreground)] bg-[var(--surface-2)]",
    expected: "Reponse attendue: choisis la bonne structure.",
  },
  structure_from_example: {
    badge: "Usage",
    badgeClass: "border-[#3b82f6] text-[#3b82f6] bg-[color-mix(in_srgb,#3b82f6_12%,transparent)]",
    expected: "Reponse attendue: identifie la structure utilisee.",
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
  const { locale } = useI18n();
  const tr = (frText: string, enText: string) => (locale === "fr" ? frText : enText);
  const [targetLevel, setTargetLevel] = useState<JLPTLevel>("N5");
  const [loadedGrammarByLevel, setLoadedGrammarByLevel] =
    useState<Partial<Record<JLPTLevel, GrammarPoint[]>>>(grammarByLevel);
  const [isCumulative, setIsCumulative] = useState(true);
  const [setSize, setSetSize] = useState<number>(10);
  const [session, setSession] = useState<GrammarPoint[]>([]);
  const [progress, setProgress] = useState<GrammarSessionProgress>(INITIAL_PROGRESS);
  const [question, setQuestion] = useState<GrammarQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [showHelper, setShowHelper] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);

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

  const ensureGrammarLevelsLoaded = useCallback(async (levels: JLPTLevel[]) => {
    const missing = levels.filter((level) => !loadedGrammarByLevel[level]);
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (level) => [level, await grammarLevelLoaders[level]()] as const),
    );
    setLoadedGrammarByLevel((prev) => {
      const next = { ...prev };
      for (const [level, data] of entries) next[level] = data;
      return next;
    });
  }, [loadedGrammarByLevel]);

  useEffect(() => {
    const neededLevels = isCumulative ? LEVELS.slice(0, LEVELS.indexOf(targetLevel) + 1) : [targetLevel];
    void ensureGrammarLevelsLoaded(neededLevels);
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
  }

  function stopTraining(): void {
    setSession([]);
    setProgress(INITIAL_PROGRESS);
    setQuestion(null);
    setSelected(null);
    setFeedback(null);
    setShowStopModal(false);
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

    window.setTimeout(() => {
      const nextProgress = updateProgress(progress, ok);
      const nextItem = session[nextProgress.index] ?? null;
      setProgress(nextProgress);
      setSelected(null);
      setFeedback(null);
      setQuestion(nextItem ? createQuestion(nextItem, pool) : null);
    }, 650);
  }

  useEffect(() => {
    const inProgress = inSession && progress.total > 0;
    const accuracy =
      progress.correct + progress.wrong > 0
        ? Math.round((progress.correct / (progress.correct + progress.wrong)) * 100)
        : 0;

    saveTrainingStatus({
      module: "grammar",
      label: "Grammar Trainer",
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
          <p className="text-sm font-semibold">Grammar Trainer JLPT</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHelper(true)}
              className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
              aria-label="Afficher les explications du grammar trainer"
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </button>
            {inSession && (
              <button
                type="button"
                onClick={() => setShowStopModal(true)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label="Fermer le set"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="text-muted mt-1 text-xs">
          {tr(
            "Entraine-toi en boucle rapide: structure, sens, usage, feedback instantane.",
            "Train in a fast loop: structure, meaning, usage, instant feedback.",
          )}
        </p>

        {!inSession && !isDone && (
          <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{tr("Mode de pool", "Pool mode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => setIsCumulative(true)}
                  variant={isCumulative ? "default" : "outline"}
                  className="h-9 rounded-lg text-xs font-medium transition"
                >
                  {tr("Cumulatif", "Cumulative")}
                </Button>
                <Button
                  type="button"
                  onClick={() => setIsCumulative(false)}
                  variant={!isCumulative ? "default" : "outline"}
                  className="h-9 rounded-lg text-xs font-medium transition"
                >
                  {tr("Niveau precis", "Specific level")}
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">
                {isCumulative ? tr("Niveau cumulatif cible", "Target cumulative level") : tr("Niveau cible", "Target level")}
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
              <p className="text-muted mb-1 text-xs font-medium">{tr("Taille du set", "Set size")}</p>
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
                <p className="text-muted text-[11px]">{tr("Points disponibles", "Available points")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{Math.min(setSize, pool.length)}</p>
                <p className="text-muted text-[11px]">{tr("Questions du set", "Questions in set")}</p>
              </div>
            </div>

            <Button
              type="button"
              onClick={startTraining}
              disabled={pool.length === 0}
              className="mt-4 flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {tr("Lancer le training", "Start training")}
            </Button>

            {pool.length === 0 && (
              <p className="text-muted mt-2 text-xs">
                {tr(
                  "Donnees absentes pour ce niveau. Ajoute les fichiers grammar_n5 a grammar_n1 via le pipeline.",
                  "No data for this level. Add grammar_n5 to grammar_n1 files via the pipeline.",
                )}
              </p>
            )}
          </>
        )}

        {inSession && current && question && (
          <>
            <div className="surface-card mt-4 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted text-xs">
                  {tr("Level", "Level")} {current.level} - {tr("Question", "Question")} {progress.index + 1}/{progress.total}
                </p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI[question.type].badgeClass}`}
                >
                  {QUESTION_UI[question.type].badge}
                </span>
              </div>

              {question.type === "meaning_from_structure" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{tr("Structure", "Structure")}</p>
                  <p className="mt-1 text-2xl font-bold">{current.structure}</p>
                </>
              )}

              {question.type === "structure_from_meaning" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{tr("Sens", "Meaning")}</p>
                  <p className="text-muted mt-1 text-sm">{current.meaning}</p>
                </>
              )}

              {question.type === "structure_from_example" && (
                <>
                  <p className="mt-2 text-xs font-semibold">{tr("Exemple", "Example")}</p>
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
              <p className="text-muted mt-1 text-[11px]">{QUESTION_UI[question.type].expected}</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {question.choices.map((choice) => {
                  const isRight = question.answer === choice;
                  const isSelected = selected === choice;
                  const stateClass =
                    selected === null
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
                      disabled={selected !== null}
                      className={`h-10 rounded-lg px-3 text-left text-sm font-medium transition ${stateClass}`}
                    >
                      {choice}
                    </Button>
                  );
                })}
              </div>
            </div>

            <AnswerFeedback
              className="mt-2"
              tone={feedback === null ? null : feedback === "correct" ? "success" : "error"}
            />

          </>
        )}

        {isDone && (
          <>
            <div className="surface-card mt-4 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold">{tr("Set termine", "Set complete")}</p>
              <p className="text-muted mt-1 text-xs">
                {progress.correct} {tr("correct", "correct")} - {progress.wrong} {tr("erreurs", "errors")}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={startTraining}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {tr("Rejouer", "Play again")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={stopTraining}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {tr("Configurer", "Configure")}
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
              <p className="text-sm font-semibold">{tr("Comment fonctionne le Grammar Trainer", "How Grammar Trainer works")}</p>
              <button
                type="button"
                onClick={() => setShowHelper(false)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label="Fermer la fenetre d'aide"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-muted mt-2 text-xs">
              {tr(
                "Chaque set melange les points de grammaire du niveau choisi. Tu reponds rapidement, puis la carte suivante arrive automatiquement.",
                "Each set mixes grammar points from the selected level. You answer quickly, then the next card appears automatically.",
              )}
            </p>
            <p className="text-muted mt-2 text-xs">
              {tr("Types de questions", "Question types")}:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.meaning_from_structure.badgeClass}`}
              >
                {QUESTION_UI.meaning_from_structure.badge}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.structure_from_meaning.badgeClass}`}
              >
                {QUESTION_UI.structure_from_meaning.badge}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUESTION_UI.structure_from_example.badgeClass}`}
              >
                {QUESTION_UI.structure_from_example.badge}
              </span>
            </div>
            <div className="text-muted mt-2 space-y-1 text-xs">
              <p>{tr("Sens = retrouver la signification.", "Meaning = find the right meaning.")}</p>
              <p>{tr("Structure = choisir la bonne forme grammaticale.", "Structure = choose the right grammar form.")}</p>
              <p>{tr("Usage = reconnaitre la structure dans un exemple.", "Usage = identify the structure in an example.")}</p>
            </div>
          </div>
        </div>
      )}

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">{tr("Arreter ce set ?", "Stop this set?")}</p>
            <p className="text-muted mt-1 text-xs">
              {tr(
                "Tu peux sauvegarder pour reprendre plus tard, ou quitter sans garder la progression en cours.",
                "You can save to resume later, or quit without keeping current progress.",
              )}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button
                type="button"
                onClick={saveAndQuitSession}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {tr("Sauvegarder et quitter", "Save and quit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={discardAndQuitSession}
                className="h-10 rounded-lg text-sm font-medium"
              >
                {tr("Quitter sans sauvegarder", "Quit without saving")}
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
                {tr("Continuer le set", "Continue set")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
