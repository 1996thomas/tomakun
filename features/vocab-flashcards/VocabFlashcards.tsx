"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { RotateCcw, CircleDashed, Check, Zap, CircleHelp, X } from "lucide-react";
import AnswerFeedback from "@/components/feedback/AnswerFeedback";
import type { JLPTLevel, Vocab } from "@/types/vocab";
import type { ReviewRating, VocabProgressItem, VocabProgressMap } from "@/types/vocab-progress";
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

const vocabLevelLoaders: Record<JLPTLevel, () => Promise<Vocab[]>> = {
  N5: () => import("@/data/processed/vocab_n5.json").then((mod) => mod.default as Vocab[]),
  N4: () => import("@/data/processed/vocab_n4.json").then((mod) => mod.default as Vocab[]),
  N3: () => import("@/data/processed/vocab_n3.json").then((mod) => mod.default as Vocab[]),
  N2: () => import("@/data/processed/vocab_n2.json").then((mod) => mod.default as Vocab[]),
  N1: () => import("@/data/processed/vocab_n1.json").then((mod) => mod.default as Vocab[]),
};

const RATING_BUTTONS: Array<{
  rating: ReviewRating;
  Icon: LucideIcon;
  className: string;
}> = [
  {
    rating: "again",
    Icon: RotateCcw,
    className: "btn-option border-[var(--danger)] text-[var(--danger)]",
  },
  { rating: "hard", Icon: CircleDashed, className: "btn-option" },
  { rating: "good", Icon: Check, className: "btn-primary" },
  {
    rating: "easy",
    Icon: Zap,
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

function getCumulativeDataset(
  targetLevel: JLPTLevel,
  byLevel: Partial<Record<JLPTLevel, Vocab[]>>,
): Vocab[] {
  const limit = LEVELS.indexOf(targetLevel);
  const all: Vocab[] = [];
  for (let i = 0; i <= limit; i += 1) {
    all.push(...(byLevel[LEVELS[i]] ?? []));
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
  const { t } = useI18n();
  const [studyMode, setStudyMode] = useState<StudyMode>("career");
  const [loadedVocabByLevel, setLoadedVocabByLevel] =
    useState<Partial<Record<JLPTLevel, Vocab[]>>>({});
  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [loadError, setLoadError] = useState(false);
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
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const loadedRef = useRef<Partial<Record<JLPTLevel, Vocab[]>>>({});
  const inFlightRef = useRef<Partial<Record<JLPTLevel, Promise<Vocab[]>>>>({});
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

  useEffect(() => {
    loadedRef.current = loadedVocabByLevel;
  }, [loadedVocabByLevel]);

  const ensureVocabLevelsLoaded = useCallback(async (levels: JLPTLevel[]) => {
    const jobs: Array<[JLPTLevel, Promise<Vocab[]>]> = [];
    for (const level of levels) {
      if (loadedRef.current[level] !== undefined) continue;
      const existingJob = inFlightRef.current[level];
      if (existingJob) {
        jobs.push([level, existingJob]);
        continue;
      }
      const createdJob = vocabLevelLoaders[level]();
      inFlightRef.current[level] = createdJob;
      jobs.push([level, createdJob]);
    }
    if (jobs.length === 0) return;

    setIsLoadingLevels(true);
    setLoadError(false);

    const results = await Promise.allSettled(jobs.map(([, job]) => job));
    const entries: Array<readonly [JLPTLevel, Vocab[]]> = [];
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
      setLoadedVocabByLevel((prev) => {
        const next = { ...prev };
        for (const [level, data] of entries) next[level] = data;
        return next;
      });
    }
    setLoadError(hasError);
    setIsLoadingLevels(false);
  }, []);

  useEffect(() => {
    const neededLevels =
      studyMode === "career"
        ? [careerState.activeLevel]
        : isCumulativeMode
          ? LEVELS.slice(0, LEVELS.indexOf(targetLevel) + 1)
          : [targetLevel];
    queueMicrotask(() => {
      void ensureVocabLevelsLoaded(neededLevels);
    });
  }, [careerState.activeLevel, ensureVocabLevelsLoaded, isCumulativeMode, studyMode, targetLevel]);

  const freeDataset = useMemo(
    () =>
      isCumulativeMode
        ? getCumulativeDataset(targetLevel, loadedVocabByLevel)
        : (loadedVocabByLevel[targetLevel] ?? []),
    [isCumulativeMode, loadedVocabByLevel, targetLevel],
  );
  const careerLevelDataset = useMemo(
    () => loadedVocabByLevel[careerState.activeLevel] ?? [],
    [careerState.activeLevel, loadedVocabByLevel],
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
  const totalCareerStages = careerStages.length;
  const completedCareerStages = Math.min(careerState.activeStageIndex, totalCareerStages);
  const careerProgressPercent =
    totalCareerStages > 0 ? Math.round((completedCareerStages / totalCareerStages) * 100) : 0;
  const careerStageLabels = useMemo(
    () =>
      careerStages.map((_, idx) => ({
        index: idx,
        shortLabel: `${careerState.activeLevel.replace("N", "")}.${idx + 1}`,
        fullLabel: `${careerState.activeLevel}.${idx + 1}`,
      })),
    [careerStages, careerState.activeLevel],
  );

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

  function confirmStartSession(): void {
    if (savedSession) {
      setShowOverwriteModal(true);
      return;
    }
    startSession();
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
      label: studyMode === "career" ? "vocab.career" : "vocab.free",
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
          <p className="text-sm font-semibold leading-none">{t("vocab.header.title")}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHelper(true)}
              className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
              aria-label={t("vocab.header.showHelpAria")}
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </button>
            {inSession && (
              <button
                type="button"
                onClick={() => setShowStopModal(true)}
                className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
                aria-label={t("vocab.session.closeSetAria")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="text-muted mt-1 text-xs">
          {t("vocab.header.subtitle")}
        </p>
        {isLoadingLevels && (
          <p className="text-muted mt-1 text-xs">
            {t("vocab.loading.cards")}
          </p>
        )}
        {loadError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("common.error.loadData")}
          </p>
        )}

        {!inSession && (
          <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{t("common.mode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStudyMode("career")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "career" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {t("vocab.mode.career")}
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("free")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "free" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {t("vocab.mode.free")}
                </button>
              </div>
            </div>

            {studyMode === "career" ? (
              <div className="surface-card mt-3 rounded-lg p-3">
                <p className="text-xs font-semibold">
                  {t("vocab.career.activeStage")}: {careerState.activeLevel}.{careerState.activeStageIndex + 1}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {careerSeen}/{activeCareerStage.length} {t("common.seen")} · {careerMastered}/
                  {activeCareerStage.length} {t("common.mastered")} ({careerMasteryRate}%)
                </p>
                {careerStageLabels.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <p className="text-muted">
                        {t("vocab.career.stageProgress")} ({careerState.activeLevel})
                      </p>
                      <p className="font-semibold text-[var(--foreground)]">
                        {completedCareerStages}/{totalCareerStages} · {careerProgressPercent}%
                      </p>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--success))] transition-all duration-300"
                        style={{ width: `${careerProgressPercent}%` }}
                      />
                    </div>
                    <div className="mt-5 border-t border-[var(--border)]/60 pt-4">
                      <p className="text-muted mb-2 px-1 text-[10px] uppercase tracking-wide">
                        {t("vocab.career.stages")}
                      </p>
                    <div className="-mx-1 overflow-x-auto pb-1">
                      <div className="flex min-w-max items-start gap-3 px-1">
                        {careerStageLabels.map((stage) => {
                          const isCompleted = stage.index < careerState.activeStageIndex;
                          const isCurrent = stage.index === careerState.activeStageIndex;
                          return (
                            <div
                              key={stage.fullLabel}
                              className={[
                                "relative flex w-[62px] flex-col items-center gap-1.5 rounded-lg border px-2 py-2",
                                isCompleted
                                  ? "border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                                  : isCurrent
                                    ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                                    : "border-[var(--border)] bg-[var(--surface)]",
                              ].join(" ")}
                              title={stage.fullLabel}
                            >
                              <span
                                className={[
                                  "h-4 w-4 rounded-full border-2",
                                  isCompleted
                                    ? "border-[var(--success)] bg-[var(--success)]"
                                    : isCurrent
                                      ? "border-[var(--primary)] bg-[var(--primary)]"
                                      : "border-[var(--border)] bg-transparent",
                                ].join(" ")}
                                aria-hidden="true"
                              />
                              <span
                                className={[
                                  "text-[11px] font-semibold",
                                  isCompleted
                                    ? "text-[var(--success)]"
                                    : isCurrent
                                      ? "text-[var(--foreground)]"
                                      : "text-[var(--muted)]",
                                ].join(" ")}
                              >
                                {stage.shortLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">{t("common.poolMode")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(true)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {t("common.cumulative")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(false)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    !isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  {t("common.specificLevel")}
                </button>
              </div>
              <p className="text-muted mt-1 text-[11px]">
                {t("vocab.poolMode.help")}
              </p>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">
                {isCumulativeMode ? t("common.targetCumulativeLevel") : t("common.targetLevel")}
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
              <p className="text-muted mb-1 text-xs font-medium">{t("common.setSize")}</p>
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
                <p className="text-muted text-[11px]">{t("common.new")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.dueCount}</p>
                <p className="text-muted text-[11px]">{t("common.due")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.seenCount}</p>
                <p className="text-muted text-[11px]">{t("common.seen")}</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.masteredCount}</p>
                <p className="text-muted text-[11px]">{t("common.mastered")}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={confirmStartSession}
              disabled={dataset.length === 0 || isLoadingLevels}
              className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {t("common.startSet")} ({Math.min(studyMode === "career" ? activeCareerStage.length : setSize, dataset.length)} {t("common.cards")})
            </button>
          </>
        )}

        {inSession && current && (
          <>
            <div className="surface-card mt-4 rounded-xl p-5 text-center">
              <p className="text-muted text-xs">
                {studyMode === "career"
                  ? `${t("vocab.mode.career")} ${careerState.activeLevel}.${careerState.activeStageIndex + 1}`
                  : isCumulativeMode
                    ? `${t("common.upTo")} ${targetLevel}`
                    : `${t("common.level")} ${targetLevel}`}{" "}
                - {t("common.card")}{" "}
                {sessionIndex + 1}/{sessionIds.length}
              </p>
              <p className="mt-3 text-4xl font-bold">{current.word}</p>
              <p className="text-muted mt-2 text-sm">{current.reading}</p>
              {showMeaning ? (
                <p className="mt-3 text-base font-medium">{current.meaning}</p>
              ) : (
                <p className="text-muted mt-3 text-sm">{t("vocab.session.recallHint")}</p>
              )}
            </div>

            {!showMeaning && (
              <button
                type="button"
                onClick={() => setShowMeaning(true)}
                className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium"
              >
                {t("common.showAnswer")}
              </button>
            )}

            {showMeaning && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {RATING_BUTTONS.map((btn) => (
                  <button
                    key={btn.rating}
                    type="button"
                    onClick={() => handleRate(btn.rating)}
                    title={t(`vocab.rating.${btn.rating}`)}
                    aria-label={t(`vocab.rating.${btn.rating}`)}
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
              successLabel={t("feedback.wellDone")}
              errorLabel={t("feedback.review")}
            />

          </>
        )}

        {isSessionDone && (
          <div className="surface-card mt-4 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold">{t("common.setComplete")}</p>
            <p className="text-muted mt-1 text-xs">
              {t("vocab.done.desc")}
            </p>
            {studyMode === "career" && careerMasteryRate >= 85 && careerSeen >= activeCareerStage.length && (
              <button
                type="button"
                onClick={advanceCareerStage}
                className="btn-primary mt-3 h-10 w-full rounded-lg text-sm font-medium"
              >
                {t("vocab.done.nextStage")}
              </button>
            )}
            <button
              type="button"
              onClick={stopSession}
              className="btn-option mt-3 h-10 w-full rounded-lg text-sm font-medium"
            >
              {t("common.backToOptions")}
            </button>
          </div>
        )}
      </div>
      {showHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("vocab.help.title")}</p>
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
              {t("vocab.help.priority")}
            </p>
            <p className="text-muted mt-2 text-xs">
              {t("common.inMode")} <span className="font-medium">{t("vocab.mode.career")}</span>,{" "}
              {t("vocab.help.careerMode")} {t("common.inMode")} <span className="font-medium">{t("vocab.mode.free")}</span>,{" "}
              {t("vocab.help.freeMode")}
            </p>
            <p className="text-muted mt-2 text-xs">
              {t("common.stats")}:
              <span className="ml-1">{t("vocab.help.newDef")}</span>,
              <span className="ml-1">{t("vocab.help.dueDef")}</span>,
              <span className="ml-1">{t("vocab.help.seenDef")}</span>,
              <span className="ml-1">{t("vocab.help.masteredDef")}</span>.
            </p>

            <p className="mt-3 text-xs font-semibold">{t("vocab.help.iconMeaning")}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RATING_BUTTONS.map((btn) => (
                <div key={`helper-${btn.rating}`} className="surface-card flex items-center gap-2 rounded-lg p-2">
                  <btn.Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-muted text-xs">
                    {t(`vocab.rating.${btn.rating}`)}:
                    {" "}
                    {t(`vocab.help.rating.${btn.rating}`)}
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
            <p className="text-sm font-semibold">{t("common.stopSetTitle")}</p>
            <p className="text-muted mt-1 text-xs">
              {t("common.stopSetDesc")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={saveAndStopSession}
                className="btn-primary h-10 rounded-lg text-sm font-medium"
              >
                {t("common.saveAndQuit")}
              </button>
              <button
                type="button"
                onClick={stopWithoutSaving}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {t("common.quitWithoutSaving")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStopModal(false);
                  setPendingNavigationHref(null);
                }}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {t("common.continueSet")}
              </button>
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
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteModal(false);
                  restoreSavedSession();
                }}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {t("common.resumeSaved")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteModal(false);
                  startSession();
                }}
                className="btn-primary h-10 rounded-lg text-sm font-medium"
              >
                {t("common.restartSet")}
              </button>
              <button
                type="button"
                onClick={() => setShowOverwriteModal(false)}
                className="btn-option h-10 rounded-lg text-sm font-medium"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
