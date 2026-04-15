"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

type SavedStateSnapshot = {
  kana: boolean;
  vocab: boolean;
  grammar: boolean;
};

const EMPTY_SAVED_STATE: SavedStateSnapshot = {
  kana: false,
  vocab: false,
  grammar: false,
};

let cachedSavedStateKey: string | undefined;
let cachedSavedStateSnapshot: SavedStateSnapshot = EMPTY_SAVED_STATE;

function subscribeSavedState(onStoreChange: () => void): () => void {
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
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("tomakun:kana-session-sync", onAnySessionEvent);
    window.removeEventListener("tomakun:hiragana-session-sync", onAnySessionEvent);
    window.removeEventListener("tomakun:vocab-session-sync", onAnySessionEvent);
    window.removeEventListener("tomakun:grammar-session-sync", onAnySessionEvent);
  };
}

function getSavedStateSnapshot() {
  if (typeof window === "undefined") return EMPTY_SAVED_STATE;

  const hasKana = Boolean(window.localStorage.getItem("tomakun.kana.session.v1"));
  const hasHiragana = Boolean(window.localStorage.getItem("tomakun.hiragana.session.v1"));
  const hasVocab = Boolean(window.localStorage.getItem("tomakun.vocab.session.v1"));
  const hasGrammar = Boolean(window.localStorage.getItem("tomakun.grammar.session.v1"));
  const nextKey = `${hasKana ? "1" : "0"}${hasHiragana ? "1" : "0"}${hasVocab ? "1" : "0"}${hasGrammar ? "1" : "0"}`;

  if (nextKey === cachedSavedStateKey) {
    return cachedSavedStateSnapshot;
  }

  cachedSavedStateKey = nextKey;
  cachedSavedStateSnapshot = {
    kana: hasKana || hasHiragana,
    vocab: hasVocab,
    grammar: hasGrammar,
  };
  return cachedSavedStateSnapshot;
}

function SavedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--success)]">
      {label}
    </span>
  );
}

export default function Home() {
  const { t } = useI18n();
  const savedState = useSyncExternalStore(
    subscribeSavedState,
    getSavedStateSnapshot,
    () => EMPTY_SAVED_STATE,
  );

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <p className="text-muted text-sm font-medium">TOMAKUN</p>
        <h1 className="mt-1 text-2xl font-bold">{t("home.title")}</h1>
        <p className="text-muted mt-2 text-sm">
          {t("home.subtitle")}
        </p>
      </div>

      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Kana Trainer</p>
          {savedState.kana && <SavedBadge label={t("home.resume")} />}
        </div>
        <p className="text-muted mt-1 text-xs">
          {t("home.kanaDesc")}
        </p>
        <Link
          href="/kana-trainer"
          className="btn-primary mt-3 flex h-10 items-center justify-center rounded-lg text-sm font-medium"
        >
          {t("home.kanaOpen")}
        </Link>
      </div>

      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("home.vocabTitle")}</p>
          {savedState.vocab && <SavedBadge label={t("home.resume")} />}
        </div>
        <p className="text-muted mt-1 text-xs">
          {t("home.vocabDesc")}
        </p>
        <Link
          href="/vocab"
          className="btn-primary mt-3 flex h-10 items-center justify-center rounded-lg text-sm font-medium"
        >
          {t("home.vocabOpen")}
        </Link>
      </div>

      <div className="surface-card mb-4 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("home.grammarTitle")}</p>
          {savedState.grammar && <SavedBadge label={t("home.resume")} />}
        </div>
        <p className="text-muted mt-1 text-xs">
          {t("home.grammarDesc")}
        </p>
        <Link
          href="/grammar"
          className="btn-primary mt-3 flex h-10 items-center justify-center rounded-lg text-sm font-medium"
        >
          {t("home.grammarOpen")}
        </Link>
      </div>
    </section>
  );
}
