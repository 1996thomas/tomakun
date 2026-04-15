"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { RotateCcw, CircleDashed, Check, Zap, CircleHelp, X } from "lucide-react";
import AnswerFeedback from "@/components/feedback/AnswerFeedback";
import type { JLPTLevel, Vocab } from "@/types/vocab";
import type { ReviewRating, VocabProgressItem, VocabProgressMap } from "@/types/vocab-progress";
import vocabN1Json from "@/data/processed/vocab_n1.json";
import vocabN2Json from "@/data/processed/vocab_n2.json";
import vocabN3Json from "@/data/processed/vocab_n3.json";
import vocabN4Json from "@/data/processed/vocab_n4.json";
import vocabN5Json from "@/data/processed/vocab_n5.json";
import { applyReview, createInitialProgress } from "@/lib/srs";
import { saveVocabProgress } from "@/lib/vocab-progress.storage";
import {
  saveVocabCareerState,
  type VocabCareerState,
} from "@/lib/vocab-career.storage";
import { clearTrainingStatus, saveTrainingStatus } from "@/lib/training-status.storage";
import {
  VOCAB_SESSION_EVENT,
  clearVocabSession,
  loadSavedVocabSession,
  saveVocabSession,
} from "@/lib/vocab-session.storage";
import { RESUME_SAVED_SET_EVENT } from "@/lib/saved-set.events";
import { useI18n } from "@/lib/i18n";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const SET_SIZES = [10, 20, 30, 50] as const;
const CAREER_STAGE_SIZE = 20;
const CAREER_MASTERY_STREAK = 2;
const CAREER_MIN_SEEN = 2;
const CAREER_MIN_ACCURACY = 0.7;
type StudyMode = "career" | "free";
const CLIENT_STORAGE_EVENT = "tomakun:vocab-storage-sync";
const PROGRESS_STORAGE_KEY = "tomakun.vocab.progress.v1";
const CAREER_STORAGE_KEY = "tomakun.vocab.career.v1";
const EMPTY_PROGRESS: VocabProgressMap = {};
const DEFAULT_CAREER_STATE: VocabCareerState = {
  activeLevel: "N5",
  activeStageIndex: 0,
};
let cachedProgressRaw: string | null | undefined;
let cachedProgressSnapshot: VocabProgressMap = EMPTY_PROGRESS;
let cachedCareerRaw: string | null | undefined;
let cachedCareerSnapshot: VocabCareerState = DEFAULT_CAREER_STATE;
let cachedSavedVocabRaw: string | null | undefined;
let cachedSavedVocabSnapshot = loadSavedVocabSession();

const vocabByLevel: Record<JLPTLevel, Vocab[]> = {
  N5: vocabN5Json as Vocab[],
  N4: vocabN4Json as Vocab[],
  N3: vocabN3Json as Vocab[],
  N2: vocabN2Json as Vocab[],
  N1: vocabN1Json as Vocab[],
};

const RATING_BUTTONS: Array<{
  rating: ReviewRating;
  Icon: LucideIcon;
  title: string;
  className: string;
}> = [
  {
    rating: "again",
    Icon: RotateCcw,
    title: "Again",
    className: "btn-option border-[var(--danger)] text-[var(--danger)]",
  },
  { rating: "hard", Icon: CircleDashed, title: "Hard", className: "btn-option" },
  { rating: "good", Icon: Check, title: "Good", className: "btn-primary" },
  {
    rating: "easy",
    Icon: Zap,
    title: "Easy",
    className: "btn-option border-[var(--success)] text-[var(--success)]",
  },
];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getCumulativeDataset(targetLevel: JLPTLevel): Vocab[] {
  const limit = LEVELS.indexOf(targetLevel);
  const all: Vocab[] = [];
  for (let i = 0; i <= limit; i += 1) {
    all.push(...vocabByLevel[LEVELS[i]]);
  }
  return all;
}

function chunkDataset(dataset: Vocab[], size: number): Vocab[][] {
  const out: Vocab[][] = [];
  for (let i = 0; i < dataset.length; i += size) {
    out.push(dataset.slice(i, i + size));
  }
  return out;
}

function careerMasteredCount(stage: Vocab[], progress: VocabProgressMap): number {
  let mastered = 0;
  for (const card of stage) {
    const item = progress[card.id];
    if (!item) continue;
    const accuracy = item.correctCount / Math.max(1, item.seenCount);
    if (
      item.seenCount >= CAREER_MIN_SEEN &&
      item.streak >= CAREER_MASTERY_STREAK &&
      accuracy >= CAREER_MIN_ACCURACY
    ) {
      mastered += 1;
    }
  }
  return mastered;
}

function careerSeenCount(stage: Vocab[], progress: VocabProgressMap): number {
  let seen = 0;
  for (const card of stage) {
    const item = progress[card.id];
    if (item && item.seenCount > 0) seen += 1;
  }
  return seen;
}

function pickUniqueWithLimit(ids: string[], limit: number, used: Set<string>): string[] {
  const output: string[] = [];
  for (const id of shuffle(ids)) {
    if (output.length >= limit) break;
    if (used.has(id)) continue;
    output.push(id);
    used.add(id);
  }
  return output;
}

function buildSessionQueue(
  dataset: Vocab[],
  progress: VocabProgressMap,
  setSize: number,
  now = new Date(),
): string[] {
  if (dataset.length === 0) return [];

  const nowTs = now.getTime();
  const unseen: string[] = [];
  const dueSeen: string[] = [];
  const weak: string[] = [];
  const other: string[] = [];

  for (const card of dataset) {
    const item = progress[card.id];
    if (!item || item.seenCount === 0) {
      unseen.push(card.id);
      continue;
    }

    const nextTs = Date.parse(item.nextReviewAt);
    const isDue = Number.isFinite(nextTs) ? nextTs <= nowTs : true;
    if (isDue) {
      dueSeen.push(card.id);
      continue;
    }

    const accuracy = item.correctCount / Math.max(1, item.seenCount);
    if (accuracy < 0.6 || item.streak < 2) {
      weak.push(card.id);
    } else {
      other.push(card.id);
    }
  }

  const used = new Set<string>();
  const target = Math.min(setSize, dataset.length);

  const dueQuota = Math.min(target, Math.max(1, Math.floor(target * 0.7)));
  const weakQuota = Math.min(target - dueQuota, Math.floor(target * 0.2));
  const newQuota = Math.min(target - dueQuota - weakQuota, Math.floor(target * 0.1));

  const queue: string[] = [
    ...pickUniqueWithLimit([...dueSeen, ...unseen], dueQuota, used),
    ...pickUniqueWithLimit(weak, weakQuota, used),
    ...pickUniqueWithLimit(unseen, newQuota, used),
  ];

  if (queue.length < target) {
    const refillPool = [...dueSeen, ...unseen, ...weak, ...other];
    queue.push(...pickUniqueWithLimit(refillPool, target - queue.length, used));
  }

  return queue;
}

function summarize(dataset: Vocab[], progress: VocabProgressMap): {
  newCount: number;
  dueCount: number;
  seenCount: number;
  masteredCount: number;
} {
  const nowTs = Date.now();
  let newCount = 0;
  let dueCount = 0;
  let seenCount = 0;
  let masteredCount = 0;

  for (const card of dataset) {
    const item = progress[card.id];
    if (!item) {
      newCount += 1;
      continue;
    }

    seenCount += 1;
    const nextTs = Date.parse(item.nextReviewAt);
    if (!Number.isFinite(nextTs) || nextTs <= nowTs) {
      dueCount += 1;
    }
    if (item.streak >= 4 && item.correctCount / Math.max(1, item.seenCount) >= 0.8) {
      masteredCount += 1;
    }
  }

  return { newCount, dueCount, seenCount, masteredCount };
}

function getProgressSnapshot(): VocabProgressMap {
  if (typeof window === "undefined") return EMPTY_PROGRESS;
  const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
  if (raw === cachedProgressRaw) {
    return cachedProgressSnapshot;
  }

  cachedProgressRaw = raw;
  if (!raw) {
    cachedProgressSnapshot = EMPTY_PROGRESS;
    return cachedProgressSnapshot;
  }

  try {
    const parsed = JSON.parse(raw) as VocabProgressMap;
    cachedProgressSnapshot = parsed ?? EMPTY_PROGRESS;
  } catch {
    cachedProgressSnapshot = EMPTY_PROGRESS;
  }
  return cachedProgressSnapshot;
}

function getCareerSnapshot(): VocabCareerState {
  if (typeof window === "undefined") return DEFAULT_CAREER_STATE;
  const raw = window.localStorage.getItem(CAREER_STORAGE_KEY);
  if (raw === cachedCareerRaw) {
    return cachedCareerSnapshot;
  }

  cachedCareerRaw = raw;
  if (!raw) {
    cachedCareerSnapshot = DEFAULT_CAREER_STATE;
    return cachedCareerSnapshot;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VocabCareerState>;
    const activeLevel = parsed.activeLevel;
    const activeStageIndex = parsed.activeStageIndex;
    cachedCareerSnapshot = {
      activeLevel:
        activeLevel === "N5" ||
        activeLevel === "N4" ||
        activeLevel === "N3" ||
        activeLevel === "N2" ||
        activeLevel === "N1"
          ? activeLevel
          : "N5",
      activeStageIndex:
        typeof activeStageIndex === "number" && activeStageIndex >= 0 ? activeStageIndex : 0,
    };
  } catch {
    cachedCareerSnapshot = DEFAULT_CAREER_STATE;
  }

  return cachedCareerSnapshot;
}

function getSavedVocabSnapshot() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("tomakun.vocab.session.v1");
  if (raw === cachedSavedVocabRaw) return cachedSavedVocabSnapshot;
  cachedSavedVocabRaw = raw;
  cachedSavedVocabSnapshot = loadSavedVocabSession();
  return cachedSavedVocabSnapshot;
}

export default function VocabFlashcards() {
  const { locale } = useI18n();
  const tr = (frText: string, enText: string) => (locale === "fr" ? frText : enText);
  const [studyMode, setStudyMode] = useState<StudyMode>("career");
  const [targetLevel, setTargetLevel] = useState<JLPTLevel>("N5");
  const [isCumulativeMode, setIsCumulativeMode] = useState(true);
  const [setSize, setSetSize] = useState<number>(20);
  const progress = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (
          e.key === "tomakun.vocab.progress.v1" ||
          e.key === "tomakun.vocab.career.v1" ||
          e.key === null
        ) {
          onStoreChange();
        }
      };
      const onLocalSync = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(CLIENT_STORAGE_EVENT, onLocalSync);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CLIENT_STORAGE_EVENT, onLocalSync);
      };
    },
    getProgressSnapshot,
    () => EMPTY_PROGRESS,
  );
  const careerState = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === "tomakun.vocab.career.v1" || e.key === null) {
          onStoreChange();
        }
      };
      const onLocalSync = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(CLIENT_STORAGE_EVENT, onLocalSync);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CLIENT_STORAGE_EVENT, onLocalSync);
      };
    },
    getCareerSnapshot,
    () => DEFAULT_CAREER_STATE,
  );

  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [answerFeedback, setAnswerFeedback] = useState<"success" | "error" | null>(null);
  const [showStopModal, setShowStopModal] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const savedSession = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === "tomakun.vocab.session.v1" || e.key === null) onStoreChange();
      };
      const onLocal = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(VOCAB_SESSION_EVENT, onLocal);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(VOCAB_SESSION_EVENT, onLocal);
      };
    },
    getSavedVocabSnapshot,
    () => null,
  );

  const freeDataset = useMemo(
    () => (isCumulativeMode ? getCumulativeDataset(targetLevel) : vocabByLevel[targetLevel]),
    [isCumulativeMode, targetLevel],
  );
  const careerLevelDataset = useMemo(
    () => vocabByLevel[careerState.activeLevel],
    [careerState.activeLevel],
  );
  const careerStages = useMemo(
    () => chunkDataset(careerLevelDataset, CAREER_STAGE_SIZE),
    [careerLevelDataset],
  );
  const activeCareerStage = useMemo(() => {
    if (careerStages.length === 0) return [];
    return careerStages[Math.min(careerState.activeStageIndex, careerStages.length - 1)];
  }, [careerStages, careerState.activeStageIndex]);
  const dataset = studyMode === "career" ? activeCareerStage : freeDataset;
  const datasetById = useMemo(() => new Map(dataset.map((item) => [item.id, item])), [dataset]);
  const currentId = sessionIds[sessionIndex] ?? null;
  const current = currentId ? (datasetById.get(currentId) ?? null) : null;
  const inSession = sessionIds.length > 0 && sessionIndex < sessionIds.length;
  const isSessionDone = sessionIds.length > 0 && sessionIndex >= sessionIds.length;
  const stats = useMemo(() => summarize(dataset, progress), [dataset, progress]);
  const careerMastered = useMemo(
    () => careerMasteredCount(activeCareerStage, progress),
    [activeCareerStage, progress],
  );
  const careerSeen = useMemo(
    () => careerSeenCount(activeCareerStage, progress),
    [activeCareerStage, progress],
  );
  const careerMasteryRate =
    activeCareerStage.length > 0 ? Math.round((careerMastered / activeCareerStage.length) * 100) : 0;

  function startSession(): void {
    clearVocabSession();
    const targetSize = studyMode === "career" ? activeCareerStage.length : setSize;
    const queue = buildSessionQueue(dataset, progress, targetSize);
    setSessionIds(queue);
    setSessionIndex(0);
    setShowMeaning(false);
    setSessionCorrect(0);
    setSessionWrong(0);
    setAnswerFeedback(null);
  }

  function stopSession(): void {
    setSessionIds([]);
    setSessionIndex(0);
    setShowMeaning(false);
    setSessionCorrect(0);
    setSessionWrong(0);
    setAnswerFeedback(null);
    setShowStopModal(false);
  }

  const restoreSavedSession = useCallback((): void => {
    if (!savedSession) return;
    setStudyMode(savedSession.studyMode);
    setTargetLevel(savedSession.targetLevel);
    setIsCumulativeMode(savedSession.isCumulativeMode);
    setSetSize(savedSession.setSize);
    setSessionIds(savedSession.sessionIds);
    setSessionIndex(savedSession.sessionIndex);
    setShowMeaning(savedSession.showMeaning);
    setSessionCorrect(savedSession.sessionCorrect);
    setSessionWrong(savedSession.sessionWrong);
    setAnswerFeedback(null);
    clearVocabSession();
  }, [savedSession]);

  function saveAndStopSession(): void {
    saveVocabSession({
      studyMode,
      targetLevel,
      isCumulativeMode,
      setSize,
      sessionIds,
      sessionIndex,
      showMeaning,
      sessionCorrect,
      sessionWrong,
      savedAt: new Date().toISOString(),
    });
    stopSession();
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  function stopWithoutSaving(): void {
    clearVocabSession();
    stopSession();
    if (pendingNavigationHref) window.location.assign(pendingNavigationHref);
    setPendingNavigationHref(null);
  }

  function advanceCareerStage(): void {
    const levelIdx = LEVELS.indexOf(careerState.activeLevel);
    const isLastStageInLevel = careerState.activeStageIndex >= Math.max(0, careerStages.length - 1);
    let nextLevel = careerState.activeLevel;
    let nextStageIndex = careerState.activeStageIndex + 1;

    if (isLastStageInLevel) {
      if (levelIdx < LEVELS.length - 1) {
        nextLevel = LEVELS[levelIdx + 1];
        nextStageIndex = 0;
      } else {
        nextStageIndex = careerState.activeStageIndex;
      }
    }

    const nextState = {
      activeLevel: nextLevel,
      activeStageIndex: nextStageIndex,
    };
    saveVocabCareerState(nextState);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLIENT_STORAGE_EVENT));
    }
    stopSession();
  }

  function handleRate(rating: ReviewRating): void {
    if (!current) return;

    const base: VocabProgressItem = progress[current.id] ?? createInitialProgress(current.id, current.level);
    const updated = applyReview(base, rating);
    const nextMap: VocabProgressMap = {
      ...progress,
      [current.id]: updated,
    };
    saveVocabProgress(nextMap);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLIENT_STORAGE_EVENT));
    }

    if (rating === "good" || rating === "easy") {
      setSessionCorrect((prev) => prev + 1);
      setAnswerFeedback("success");
    } else {
      setSessionWrong((prev) => prev + 1);
      setAnswerFeedback("error");
    }

    setSessionIndex((prev) => prev + 1);
    setShowMeaning(false);
  }

  useEffect(() => {
    const totalAnswered = sessionCorrect + sessionWrong;
    const accuracy = totalAnswered > 0 ? Math.round((sessionCorrect / totalAnswered) * 100) : 0;
    saveTrainingStatus({
      module: "vocab",
      label: studyMode === "career" ? "Vocab Carriere" : "Vocab Libre",
      current: Math.min(sessionIndex, sessionIds.length),
      goal: sessionIds.length,
      correct: sessionCorrect,
      wrong: sessionWrong,
      accuracy,
      sessionEnded: isSessionDone,
      isActive: inSession,
    });
  }, [inSession, isSessionDone, sessionCorrect, sessionIds.length, sessionIndex, sessionWrong, studyMode]);

  useEffect(() => {
    return () => {
      clearTrainingStatus();
    };
  }, []);

  useEffect(() => {
    const onResumeRequest = (event: Event) => {
      const custom = event as CustomEvent<{ module: "vocab" }>;
      if (custom.detail?.module !== "vocab") return;
      restoreSavedSession();
    };
    window.addEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
    return () => window.removeEventListener(RESUME_SAVED_SET_EVENT, onResumeRequest);
  }, [restoreSavedSession]);

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

  useEffect(() => {
    if (!answerFeedback) return;
    const timer = window.setTimeout(() => setAnswerFeedback(null), 450);
    return () => window.clearTimeout(timer);
  }, [answerFeedback]);

  useEffect(() => {
    if (isSessionDone) clearVocabSession();
  }, [isSessionDone]);

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold leading-none">Exercice vocabulaire JLPT</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHelper(true)}
              className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
              aria-label="Afficher les explications des flashcards"
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
          {tr("Choisis jusqu'a quel niveau reviser, puis lance un set.", "Choose your target level, then start a set.")}
        </p>

        {!inSession && (
          <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{tr("Mode", "Mode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStudyMode("career")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "career" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {tr("Carriere", "Career")}
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("free")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "free" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {tr("Libre", "Free")}
                </button>
              </div>
            </div>

            {studyMode === "career" ? (
              <div className="surface-card mt-3 rounded-lg p-3">
                <p className="text-xs font-semibold">
                  {tr("Etape active", "Active stage")}: {careerState.activeLevel}.{careerState.activeStageIndex + 1}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {careerSeen}/{activeCareerStage.length} {tr("vus", "seen")} · {careerMastered}/
                  {activeCareerStage.length} {tr("maitrises", "mastered")} ({careerMasteryRate}%)
                </p>
              </div>
            ) : (
              <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{tr("Mode de pool", "Pool mode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(true)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {tr("Cumulatif", "Cumulative")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(false)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    !isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {tr("Niveau precis", "Specific level")}
                </button>
              </div>
              <p className="text-muted mt-1 text-[11px]">
                {tr(
                  "Cumulatif inclut tous les niveaux precedents. Niveau precis cible un seul niveau.",
                  "Cumulative includes all previous levels. Specific level targets one level only.",
                )}
              </p>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">
                {isCumulativeMode ? tr("Niveau cumulatif cible", "Target cumulative level") : tr("Niveau cible", "Target level")}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setTargetLevel(level)}
                    className={[
                      "h-9 rounded-lg text-xs font-medium transition",
                      level === targetLevel ? "btn-primary" : "btn-option",
                    ].join(" ")}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{tr("Taille du set", "Set size")}</p>
              <div className="grid grid-cols-4 gap-2">
                {SET_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSetSize(size)}
                    className={[
                      "h-9 rounded-lg text-xs font-medium transition",
                      size === setSize ? "btn-primary" : "btn-option",
                    ].join(" ")}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
              </>
            )}

            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.newCount}</p>
                <p className="text-muted text-[11px]">{tr("Nouveaux", "New")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.dueCount}</p>
                <p className="text-muted text-[11px]">{tr("A revoir", "Due")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.seenCount}</p>
                <p className="text-muted text-[11px]">{tr("Vues", "Seen")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.masteredCount}</p>
                <p className="text-muted text-[11px]">{tr("Maitrisees", "Mastered")}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={startSession}
              disabled={dataset.length === 0}
              className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {tr("Lancer un set", "Start a set")} ({Math.min(studyMode === "career" ? activeCareerStage.length : setSize, dataset.length)} {tr("cartes", "cards")})
            </button>
          </>
        )}

        {inSession && current && (
          <>
            <div className="surface-card mt-4 rounded-xl p-5 text-center">
              <p className="text-muted text-xs">
                {studyMode === "career"
                  ? `${tr("Carriere", "Career")} ${careerState.activeLevel}.${careerState.activeStageIndex + 1}`
                  : isCumulativeMode
                    ? `${tr("Jusqu'a", "Up to")} ${targetLevel}`
                    : `${tr("Niveau", "Level")} ${targetLevel}`}{" "}
                - {tr("Carte", "Card")}{" "}
                {sessionIndex + 1}/{sessionIds.length}
              </p>
              <p className="mt-3 text-4xl font-bold">{current.word}</p>
              <p className="text-muted mt-2 text-sm">{current.reading}</p>
              {showMeaning ? (
                <p className="mt-3 text-base font-medium">{current.meaning}</p>
              ) : (
                <p className="text-muted mt-3 text-sm">{tr("Essaie de rappeler le sens avant de reveler.", "Try to recall the meaning before revealing it.")}</p>
              )}
            </div>

            {!showMeaning && (
              <button
                type="button"
                onClick={() => setShowMeaning(true)}
                className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium"
              >
                {tr("Voir la reponse", "Show answer")}
              </button>
            )}

            {showMeaning && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {RATING_BUTTONS.map((btn) => (
                  <button
                    key={btn.rating}
                    type="button"
                    onClick={() => handleRate(btn.rating)}
                    title={btn.title}
                    aria-label={btn.title}
                    className={`${btn.className} flex h-10 items-center justify-center rounded-lg`}
                  >
                    <btn.Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            <AnswerFeedback
              className="mt-2"
              tone={answerFeedback}
              successLabel={tr("Bien note", "Well done")}
              errorLabel={tr("A revoir", "Review")}
            />

          </>
        )}

        {isSessionDone && (
          <div className="surface-card mt-4 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold">{tr("Set termine", "Set complete")}</p>
            <p className="text-muted mt-1 text-xs">
              {tr("Bravo. Tu peux relancer un set ou changer les options.", "Great work. You can restart a set or change options.")}
            </p>
            {studyMode === "career" && careerMasteryRate >= 85 && careerSeen >= activeCareerStage.length && (
              <button
                type="button"
                onClick={advanceCareerStage}
                className="btn-primary mt-3 h-10 w-full rounded-lg text-sm font-medium"
              >
                {tr("Valider et passer a l'etape suivante", "Validate and move to next stage")}
              </button>
            )}
            <button
              type="button"
              onClick={stopSession}
              className="btn-option mt-3 h-10 w-full rounded-lg text-sm font-medium"
            >
              {tr("Back to options", "Back to options")}
            </button>
          </div>
        )}
      </div>
      {showHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{tr("Comment fonctionnent les flashcards", "How flashcards work")}</p>
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
                "Un set melange les cartes selon leur priorite: d'abord les cartes a revoir, puis les cartes faibles, puis de nouvelles cartes.",
                "A set mixes cards by priority: due cards first, then weak cards, then new cards.",
              )}
            </p>
            <p className="text-muted mt-2 text-xs">
              {tr("En mode", "In")} <span className="font-medium">{tr("Carriere", "Career")}</span>,{" "}
              {tr("tu avances etape par etape sur chaque niveau.", "you progress stage by stage on each level.")}{" "}
              {tr("En mode", "In")} <span className="font-medium">{tr("Libre", "Free")}</span>,{" "}
              {tr("tu choisis un niveau precis ou un pool cumulatif.", "you choose one level or a cumulative pool.")}
            </p>
            <p className="text-muted mt-2 text-xs">
              {tr("Stats", "Stats")}:
              <span className="ml-1">{tr("Nouveaux = jamais vus", "New = never seen")}</span>,
              <span className="ml-1">{tr("A revoir = deja vus et dus", "Due = already seen and due")}</span>,
              <span className="ml-1">{tr("Vues = deja etudies", "Seen = already studied")}</span>,
              <span className="ml-1">{tr("Maitrisees = bonne regularite + bonne precision", "Mastered = strong consistency + accuracy")}</span>.
            </p>

            <p className="mt-3 text-xs font-semibold">{tr("Signification des icones", "Icon meaning")}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RATING_BUTTONS.map((btn) => (
                <div key={`helper-${btn.rating}`} className="surface-card flex items-center gap-2 rounded-lg p-2">
                  <btn.Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-muted text-xs">
                    {btn.title}:
                    {btn.rating === "again" && tr(" je me suis trompe -> reviens vite.", " I missed it -> review soon.")}
                    {btn.rating === "hard" && tr(" correct mais difficile -> intervalle court.", " correct but hard -> short interval.")}
                    {btn.rating === "good" && tr(" bonne reponse -> progression normale.", " correct -> normal progression.")}
                    {btn.rating === "easy" && tr(" tres facile -> prochain rappel plus tard.", " very easy -> longer interval.")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">{tr("Arreter ce set ?", "Stop this set?")}</p>
            <p className="text-muted mt-1 text-xs">
              {tr("Tu peux sauvegarder pour reprendre plus tard, ou quitter sans sauvegarder.", "You can save to resume later, or quit without saving.")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={saveAndStopSession}
                className="btn-primary h-10 rounded-lg text-sm font-medium"
              >
                {tr("Sauvegarder et quitter", "Save and quit")}
              </button>
              <button
                type="button"
                onClick={stopWithoutSaving}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {tr("Quitter sans sauvegarder", "Quit without saving")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStopModal(false);
                  setPendingNavigationHref(null);
                }}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {tr("Continuer le set", "Continue set")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
