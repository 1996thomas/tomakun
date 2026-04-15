"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { RotateCcw, CircleDashed, Check, Zap, CircleHelp, X } from "lucide-react";
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

export default function VocabFlashcards() {
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
    const targetSize = studyMode === "career" ? activeCareerStage.length : setSize;
    const queue = buildSessionQueue(dataset, progress, targetSize);
    setSessionIds(queue);
    setSessionIndex(0);
    setShowMeaning(false);
  }

  function stopSession(): void {
    setSessionIds([]);
    setSessionIndex(0);
    setShowMeaning(false);
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

    setSessionIndex((prev) => prev + 1);
    setShowMeaning(false);
  }

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold leading-none">Exercice vocabulaire JLPT</p>
          <button
            type="button"
            onClick={() => setShowHelper(true)}
            className="btn-option inline-flex h-8 w-8 items-center justify-center rounded-lg"
            aria-label="Afficher les explications des flashcards"
          >
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-muted mt-1 text-xs">
          Choisis jusqu&apos;a quel niveau reviser, puis lance un set.
        </p>

        {!inSession && (
          <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">Mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStudyMode("career")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "career" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  Carriere
                </button>
                <button
                  type="button"
                  onClick={() => setStudyMode("free")}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    studyMode === "free" ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  Libre
                </button>
              </div>
            </div>

            {studyMode === "career" ? (
              <div className="surface-card mt-3 rounded-lg p-3">
                <p className="text-xs font-semibold">
                  Etape active: {careerState.activeLevel}.{careerState.activeStageIndex + 1}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {careerSeen}/{activeCareerStage.length} vus · {careerMastered}/
                  {activeCareerStage.length} maitrises ({careerMasteryRate}%)
                </p>
              </div>
            ) : (
              <>
            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">Mode de pool</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(true)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  Cumulatif
                </button>
                <button
                  type="button"
                  onClick={() => setIsCumulativeMode(false)}
                  className={[
                    "h-9 rounded-lg text-xs font-medium transition",
                    !isCumulativeMode ? "btn-primary" : "btn-option",
                  ].join(" ")}
                >
                  Niveau precis
                </button>
              </div>
              <p className="text-muted mt-1 text-[11px]">
                Cumulatif inclut tous les niveaux precedents. Niveau precis cible un seul niveau.
              </p>
            </div>

            <div className="mt-3">
              <p className="text-muted mb-1 text-xs font-medium">
                {isCumulativeMode ? "Niveau cumulatif cible" : "Niveau cible"}
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
              <p className="text-muted mb-1 text-xs font-medium">Taille du set</p>
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
                <p className="text-muted text-[11px]">Nouveaux</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.dueCount}</p>
                <p className="text-muted text-[11px]">A revoir</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.seenCount}</p>
                <p className="text-muted text-[11px]">Vues</p>
              </div>
              <div className="surface-card rounded-lg p-2 text-center">
                <p className="text-xs font-semibold">{stats.masteredCount}</p>
                <p className="text-muted text-[11px]">Maitrisees</p>
              </div>
            </div>

            <button
              type="button"
              onClick={startSession}
              disabled={dataset.length === 0}
              className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              Lancer un set ({Math.min(studyMode === "career" ? activeCareerStage.length : setSize, dataset.length)} cartes)
            </button>
          </>
        )}

        {inSession && current && (
          <>
            <div className="surface-card mt-4 rounded-xl p-5 text-center">
              <p className="text-muted text-xs">
                {studyMode === "career"
                  ? `Carriere ${careerState.activeLevel}.${careerState.activeStageIndex + 1}`
                  : isCumulativeMode
                    ? `Jusqu&apos;a ${targetLevel}`
                    : `Niveau ${targetLevel}`}{" "}
                - Carte{" "}
                {sessionIndex + 1}/{sessionIds.length}
              </p>
              <p className="mt-3 text-4xl font-bold">{current.word}</p>
              <p className="text-muted mt-2 text-sm">{current.reading}</p>
              {showMeaning ? (
                <p className="mt-3 text-base font-medium">{current.meaning}</p>
              ) : (
                <p className="text-muted mt-3 text-sm">Essaie de rappeler le sens avant de reveler.</p>
              )}
            </div>

            {!showMeaning && (
              <button
                type="button"
                onClick={() => setShowMeaning(true)}
                className="btn-primary mt-4 h-10 w-full rounded-lg text-sm font-medium"
              >
                Voir la reponse
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

            <button
              type="button"
              onClick={stopSession}
              className="btn-option mt-3 h-10 w-full rounded-lg text-sm font-medium"
            >
              Quitter le set
            </button>
          </>
        )}

        {isSessionDone && (
          <div className="surface-card mt-4 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold">Set termine</p>
            <p className="text-muted mt-1 text-xs">
              Bravo. Tu peux relancer un set ou changer les options.
            </p>
            {studyMode === "career" && careerMasteryRate >= 85 && careerSeen >= activeCareerStage.length && (
              <button
                type="button"
                onClick={advanceCareerStage}
                className="btn-primary mt-3 h-10 w-full rounded-lg text-sm font-medium"
              >
                Valider et passer a l&apos;etape suivante
              </button>
            )}
            <button
              type="button"
              onClick={stopSession}
              className="btn-option mt-3 h-10 w-full rounded-lg text-sm font-medium"
            >
              Retour aux options
            </button>
          </div>
        )}
      </div>
      {showHelper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="surface-card max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Comment fonctionnent les flashcards</p>
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
              Un set melange les cartes selon leur priorite: d&apos;abord les cartes a revoir, puis les cartes
              faibles, puis de nouvelles cartes.
            </p>
            <p className="text-muted mt-2 text-xs">
              En mode <span className="font-medium">Carriere</span>, tu avances etape par etape sur chaque niveau.
              En mode <span className="font-medium">Libre</span>, tu choisis un niveau precis ou un pool cumulatif.
            </p>
            <p className="text-muted mt-2 text-xs">
              Stats:
              <span className="ml-1">Nouveaux = jamais vus</span>,
              <span className="ml-1">A revoir = deja vus et dus</span>,
              <span className="ml-1">Vues = deja etudies</span>,
              <span className="ml-1">Maitrisees = bonne regularite + bonne precision</span>.
            </p>

            <p className="mt-3 text-xs font-semibold">Signification des icones</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RATING_BUTTONS.map((btn) => (
                <div key={`helper-${btn.rating}`} className="surface-card flex items-center gap-2 rounded-lg p-2">
                  <btn.Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-muted text-xs">
                    {btn.title}:
                    {btn.rating === "again" && " je me suis trompe -> reviens vite."}
                    {btn.rating === "hard" && " correct mais difficile -> intervalle court."}
                    {btn.rating === "good" && " bonne reponse -> progression normale."}
                    {btn.rating === "easy" && " tres facile -> prochain rappel plus tard."}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
