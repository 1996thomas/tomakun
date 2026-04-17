"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  TRAINING_STATUS_EVENT,
  loadTrainingStatus,
  type TrainingModule,
  type TrainingStatus,
} from "@/lib/training-status.storage";
import { clearGrammarSession, loadSavedGrammarSession } from "@/lib/grammar-session.storage";
import { clearKanaSession, loadSavedKanaSession } from "@/lib/kana-session.storage";
import { clearHiraganaSession, loadSavedHiraganaSession } from "@/lib/hiragana-session.storage";
import { clearVocabSession, loadSavedVocabSession } from "@/lib/vocab-session.storage";
import { RESUME_SAVED_SET_EVENT, requestResumeSavedSet } from "@/lib/saved-set.events";

const EMPTY_STATUS: TrainingStatus | null = null;
let cachedRaw: string | null | undefined;
let cachedStatus: TrainingStatus | null = EMPTY_STATUS;
type SavedSessionsState = {
  kana: ReturnType<typeof loadSavedKanaSession>;
  hiragana: ReturnType<typeof loadSavedHiraganaSession>;
  vocab: ReturnType<typeof loadSavedVocabSession>;
  grammar: ReturnType<typeof loadSavedGrammarSession>;
};
const EMPTY_SAVED_SESSIONS: SavedSessionsState = {
  kana: null,
  hiragana: null,
  vocab: null,
  grammar: null,
};
let cachedSavedSessionsRaw: string | undefined;
let cachedSavedSessionsSnapshot: SavedSessionsState = EMPTY_SAVED_SESSIONS;

function getStatusSnapshot(): TrainingStatus | null {
  if (typeof window === "undefined") return EMPTY_STATUS;
  const raw = window.localStorage.getItem("tomakun.training.status.v1");
  if (raw === cachedRaw) return cachedStatus;
  cachedRaw = raw;
  cachedStatus = loadTrainingStatus();
  return cachedStatus;
}

function getSavedSessionsSnapshot(): SavedSessionsState {
  if (typeof window === "undefined") return EMPTY_SAVED_SESSIONS;
  const rawValues = [
    window.localStorage.getItem("tomakun.kana.session.v1") ?? "",
    window.localStorage.getItem("tomakun.hiragana.session.v1") ?? "",
    window.localStorage.getItem("tomakun.vocab.session.v1") ?? "",
    window.localStorage.getItem("tomakun.grammar.session.v1") ?? "",
  ];
  const key = rawValues.join("||");
  if (key === cachedSavedSessionsRaw) return cachedSavedSessionsSnapshot;
  cachedSavedSessionsRaw = key;
  cachedSavedSessionsSnapshot = {
    kana: loadSavedKanaSession(),
    hiragana: loadSavedHiraganaSession(),
    vocab: loadSavedVocabSession(),
    grammar: loadSavedGrammarSession(),
  };
  return cachedSavedSessionsSnapshot;
}

export default function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const trainingStatus = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === "tomakun.training.status.v1" || e.key === null) onStoreChange();
      };
      const onTrainingSync = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(TRAINING_STATUS_EVENT, onTrainingSync);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(TRAINING_STATUS_EVENT, onTrainingSync);
      };
    },
    getStatusSnapshot,
    () => EMPTY_STATUS,
  );
  const savedSessions = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (
          e.key === "tomakun.kana.session.v1" ||
          e.key === "tomakun.hiragana.session.v1" ||
          e.key === "tomakun.vocab.session.v1" ||
          e.key === "tomakun.grammar.session.v1" ||
          e.key === null
        ) {
          onStoreChange();
        }
      };
      const onAnySessionEvent = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener("tomakun:kana-session-sync", onAnySessionEvent);
      window.addEventListener("tomakun:hiragana-session-sync", onAnySessionEvent);
      window.addEventListener("tomakun:vocab-session-sync", onAnySessionEvent);
      window.addEventListener("tomakun:grammar-session-sync", onAnySessionEvent);
      window.addEventListener(RESUME_SAVED_SET_EVENT, onAnySessionEvent);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("tomakun:kana-session-sync", onAnySessionEvent);
        window.removeEventListener("tomakun:hiragana-session-sync", onAnySessionEvent);
        window.removeEventListener("tomakun:vocab-session-sync", onAnySessionEvent);
        window.removeEventListener("tomakun:grammar-session-sync", onAnySessionEvent);
        window.removeEventListener(RESUME_SAVED_SET_EVENT, onAnySessionEvent);
      };
    },
    getSavedSessionsSnapshot,
    () => EMPTY_SAVED_SESSIONS,
  );

  const pageModule: TrainingModule | null =
    pathname === "/kana" || pathname.startsWith("/kana/")
      ? "kana"
      : pathname === "/hiragana" || pathname.startsWith("/hiragana/")
        ? "hiragana"
        : pathname === "/vocab" || pathname.startsWith("/vocab/")
          ? "vocab"
          : pathname === "/grammar" || pathname.startsWith("/grammar/")
            ? "grammar"
            : null;
  const isKanaTrainerPage = pathname === "/kana-trainer" || pathname.startsWith("/kana-trainer/");

  const activeStatus =
    pageModule &&
    trainingStatus &&
    trainingStatus.module === pageModule &&
    trainingStatus.isActive &&
    trainingStatus.goal > 0
      ? trainingStatus
      : null;

  const currentExerciseProgress = activeStatus
    ? Math.round((Math.max(0, activeStatus.current) / Math.max(1, activeStatus.goal)) * 100)
    : 0;
  const savedPreview = (() => {
    if (!pageModule) return null;
    if (pageModule === "kana") {
      const saved = savedSessions.kana;
      if (!saved) return null;
      return { current: saved.answeredCount, goal: saved.sessionGoal };
    }
    if (pageModule === "hiragana") {
      const saved = savedSessions.hiragana;
      if (!saved) return null;
      return { current: saved.answeredCount, goal: saved.sessionGoal };
    }
    if (pageModule === "vocab") {
      const saved = savedSessions.vocab;
      if (!saved) return null;
      return { current: saved.sessionIndex, goal: saved.sessionIds.length };
    }
    if (pageModule === "grammar") {
      const saved = savedSessions.grammar;
      if (!saved) return null;
      return { current: saved.progress.index, goal: saved.progress.total };
    }
    return null;
  })();
  const savedKana = savedSessions.kana;
  const savedHiragana = savedSessions.hiragana;

  const moduleLabel =
    pageModule === "kana"
      ? t("module.katakana")
      : pageModule === "hiragana"
        ? t("module.hiragana")
        : pageModule === "vocab"
          ? t("module.vocab")
          : pageModule === "grammar"
            ? t("module.grammar")
            : t("module.default");

  return (
    <aside className="surface-card fixed right-0 bottom-0 left-0 z-20 border-x-0 border-b-0">
      <div className="mx-auto w-full max-w-md px-4 py-2">
        {isKanaTrainerPage ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">
                {t("module.kana")} - {t("bottom.settings")}
              </p>
              <p className="text-muted text-[11px]">
                {t("bottom.savedCount", { count: (savedKana ? 1 : 0) + (savedHiragana ? 1 : 0) })}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="surface-card rounded-md p-2">
                <p className="text-[10px] font-semibold">{t("module.katakana")}</p>
                <p className="text-muted mt-0.5 text-[10px]">
                  {savedKana ? `${savedKana.answeredCount}/${savedKana.sessionGoal}` : t("bottom.noSaved")}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={!savedKana}
                    onClick={() => {
                      if (!savedKana) return;
                      window.location.href = `/kana?series=${savedKana.series}&resume=saved`;
                    }}
                    className="btn-primary h-7 rounded-md text-[10px] font-medium disabled:opacity-50"
                  >
                    {t("bottom.continue")}
                  </button>
                  <button
                    type="button"
                    disabled={!savedKana}
                    onClick={clearKanaSession}
                    className="btn-option h-7 rounded-md text-[10px] font-medium disabled:opacity-50"
                  >
                    {t("bottom.delete")}
                  </button>
                </div>
              </div>

              <div className="surface-card rounded-md p-2">
                <p className="text-[10px] font-semibold">{t("module.hiragana")}</p>
                <p className="text-muted mt-0.5 text-[10px]">
                  {savedHiragana ? `${savedHiragana.answeredCount}/${savedHiragana.sessionGoal}` : t("bottom.noSaved")}
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={!savedHiragana}
                    onClick={() => {
                      if (!savedHiragana) return;
                      window.location.href = `/hiragana?series=${savedHiragana.series}&resume=saved`;
                    }}
                    className="btn-primary h-7 rounded-md text-[10px] font-medium disabled:opacity-50"
                  >
                    {t("bottom.continue")}
                  </button>
                  <button
                    type="button"
                    disabled={!savedHiragana}
                    onClick={clearHiraganaSession}
                    className="btn-option h-7 rounded-md text-[10px] font-medium disabled:opacity-50"
                  >
                    {t("bottom.delete")}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : pageModule ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">
                {moduleLabel} - {activeStatus ? t("bottom.inProgress") : t("bottom.settings")}
              </p>
              <p className="text-muted text-[11px]">
                {activeStatus ? `${currentExerciseProgress}%` : t("bottom.configureSet")}
              </p>
            </div>

            {activeStatus && (
              <div className="progress-track mt-2 h-2 overflow-hidden rounded-full">
                <div className="progress-fill h-full transition-all" style={{ width: `${currentExerciseProgress}%` }} />
              </div>
            )}

            {activeStatus && (
              <div className="mt-2 grid grid-cols-3 gap-1">
                <div className="surface-card rounded-md p-1 text-center">
                  <p className="text-[10px] font-semibold">{activeStatus.correct}</p>
                  <p className="text-muted text-[10px]">{t("bottom.correct")}</p>
                </div>
                <div className="surface-card rounded-md p-1 text-center">
                  <p className="text-[10px] font-semibold">{activeStatus.wrong}</p>
                  <p className="text-muted text-[10px]">{t("bottom.errors")}</p>
                </div>
                <div className="surface-card rounded-md p-1 text-center">
                  <p className="text-[10px] font-semibold">
                    {activeStatus.current}/{activeStatus.goal}
                  </p>
                  <p className="text-muted text-[10px]">{t("bottom.progress")}</p>
                </div>
              </div>
            )}

            {!activeStatus && savedPreview && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => pageModule && requestResumeSavedSet(pageModule)}
                  className="btn-primary h-9 rounded-lg text-xs font-medium"
                >
                  {t("bottom.continue")} ({savedPreview.current}/{savedPreview.goal})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pageModule === "kana") clearKanaSession();
                    else if (pageModule === "hiragana") clearHiraganaSession();
                    else if (pageModule === "vocab") clearVocabSession();
                    else if (pageModule === "grammar") clearGrammarSession();
                  }}
                  className="btn-option h-9 rounded-lg text-xs font-medium"
                >
                  {t("bottom.delete")}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted text-center text-xs">{t("bottom.openModuleHint")}</p>
        )}
      </div>
    </aside>
  );
}
