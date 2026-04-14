"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ROUTINE_CHANGED_EVENT,
  ROUTINE_STORAGE_KEY,
  loadRoutineBundle,
} from "@/lib/routine.storage";
import type { RoutineBundle } from "@/types/routine";

const empty: RoutineBundle = { plan: null, run: null };

/** React exige que getSnapshot renvoie la meme reference tant que les donnees sont inchangées. */
let snapshotCache: RoutineBundle = empty;
let snapshotSignature: string | null = null;

function getRoutineBundleSnapshot(): RoutineBundle {
  const bundle = loadRoutineBundle();
  const signature = JSON.stringify(bundle);
  if (snapshotSignature === signature) {
    return snapshotCache;
  }
  snapshotSignature = signature;
  snapshotCache = bundle;
  return bundle;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ROUTINE_STORAGE_KEY || e.key === null) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ROUTINE_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ROUTINE_CHANGED_EVENT, onChange);
  };
}

/**
 * Lecture reactive du localStorage (pattern recommande par React pour l'hydratation).
 */
export function useRoutineBundle(): [RoutineBundle, () => void] {
  const bundle = useSyncExternalStore(subscribe, getRoutineBundleSnapshot, () => empty);

  const refresh = useCallback(() => {
    window.dispatchEvent(new Event(ROUTINE_CHANGED_EVENT));
  }, []);

  return [bundle, refresh];
}
