import {
  ROUTINE_MODULE_IDS,
  type RoutineBundle,
  type RoutineModuleId,
  type RoutinePlan,
  type RoutinePlanFeatures,
  type RoutineRun,
  type RoutineSeries,
} from "@/types/routine";
import { FULL_SERIES_COUNTS } from "@/data/routine.config";

/** Cle unique (une seule entree JSON dans localStorage). */
export const ROUTINE_STORAGE_KEY = "tomakun.routine.v2";
const LEGACY_STORAGE_KEY = "tomakun.routine.series";

const EMPTY: RoutineBundle = { plan: null, run: null };

/** Evenement maison : le localStorage ne declenche pas `storage` dans le meme onglet. */
export const ROUTINE_CHANGED_EVENT = "tomakun:routine-changed";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function newPlanId(): string {
  return `plan-${Date.now()}`;
}

export function createDefaultRoutineFeatures(): RoutinePlanFeatures {
  return {
    katakana: { enabled: true, series: "short" },
    hiragana: { enabled: true, series: "short" },
  };
}

function parseSeries(value: unknown): RoutineSeries {
  if (value === "medium" || value === "long") return value;
  return "short";
}

export function resolvePlanTargetCount(plan: RoutinePlan): number {
  return ROUTINE_MODULE_IDS.reduce((sum, moduleId) => {
    const slot = plan.features[moduleId];
    if (!slot?.enabled) return sum;
    return sum + resolveFreeSessionTarget(slot.series, moduleId);
  }, 0);
}

export function resolveFreeSessionTarget(series: RoutineSeries, module: RoutineModuleId): number {
  if (series === "short") return 10;
  if (series === "medium") return 30;
  return FULL_SERIES_COUNTS[module];
}

export function parseRoutineSeries(value: string | null): RoutineSeries {
  if (value === "medium" || value === "long") return value;
  return "short";
}

function normalizeFeaturesFromLegacy(
  series: RoutineSeries,
  modules: RoutineModuleId[],
): RoutinePlanFeatures {
  const features = createDefaultRoutineFeatures();
  for (const id of ROUTINE_MODULE_IDS) {
    features[id] = {
      enabled: modules.includes(id),
      series,
    };
  }
  return features;
}

function normalizePlan(plan: unknown): RoutinePlan | null {
  if (!plan || typeof plan !== "object") return null;
  const candidate = plan as Partial<RoutinePlan> & {
    scope?: unknown;
    series?: unknown;
    modules?: unknown;
    features?: unknown;
  };

  const updatedAt =
    typeof candidate.updatedAt === "string" ? candidate.updatedAt : "1970-01-01T00:00:00.000Z";
  const id = typeof candidate.id === "string" ? candidate.id : `plan-recovered-${updatedAt}`;

  if (candidate.features && typeof candidate.features === "object") {
    const features = createDefaultRoutineFeatures();
    const raw = candidate.features as Record<string, unknown>;
    for (const moduleId of ROUTINE_MODULE_IDS) {
      const slot = raw[moduleId];
      if (slot && typeof slot === "object" && slot !== null) {
        const s = slot as { enabled?: unknown; series?: unknown };
        features[moduleId] = {
          enabled: Boolean(s.enabled),
          series: parseSeries(s.series),
        };
      }
    }
    return { id, features, updatedAt };
  }

  const series = parseSeries(candidate.series);

  let modules: RoutineModuleId[] = [];
  if (Array.isArray(candidate.modules)) {
    modules = candidate.modules.filter(
      (m): m is RoutineModuleId => m === "katakana" || m === "hiragana",
    );
  } else if (candidate.scope === "katakana") {
    modules = ["katakana"];
  } else if (candidate.scope === "hiragana") {
    modules = ["hiragana"];
  } else if (candidate.scope === "mixed") {
    modules = ["katakana", "hiragana"];
  }

  if (modules.length === 0) {
    modules = ["katakana", "hiragana"];
  }

  return {
    id,
    features: normalizeFeaturesFromLegacy(series, modules),
    updatedAt,
  };
}

function migrateLegacyV1(raw: string): RoutineBundle | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.plan !== undefined || o.run !== undefined) return null;
    if (typeof o.series !== "string") return null;

    const series = parseSeries(o.series);
    const legacyScope = o.scope;
    const modules: RoutineModuleId[] =
      legacyScope === "katakana"
        ? ["katakana"]
        : legacyScope === "hiragana"
          ? ["hiragana"]
          : ["katakana", "hiragana"];
    const planId = "migrated-plan";
    const plan: RoutinePlan = {
      id: planId,
      features: normalizeFeaturesFromLegacy(series, modules),
      updatedAt: new Date().toISOString(),
    };
    const status = o.status as RoutineRun["status"] | undefined;
    const lastUpdatedDate =
      typeof o.lastUpdatedDate === "string" ? o.lastUpdatedDate : todayKey();
    if (status === "in_progress" || status === "completed") {
      const run: RoutineRun = {
        planId,
        status,
        targetCount:
          typeof o.targetCount === "number" ? o.targetCount : resolvePlanTargetCount(plan),
        doneCount: typeof o.doneCount === "number" ? o.doneCount : 0,
        lastUpdatedDate,
      };
      return { plan, run };
    }
    return { plan, run: null };
  } catch {
    return null;
  }
}

/** Si le run date d'un autre jour, on l'oublie (plan conserve). */
function bundleForToday(bundle: RoutineBundle): RoutineBundle {
  if (!bundle.run) return bundle;
  if (bundle.run.lastUpdatedDate === todayKey()) return bundle;
  return { ...bundle, run: null };
}

/**
 * Lit le JSON, migre l'ancienne cle si besoin, normalise, reinitialise le run si nouveau jour.
 * N'ecrit dans localStorage que si quelque chose a change (evite boucles et bruit).
 */
export function loadRoutineBundle(): RoutineBundle {
  if (typeof window === "undefined") {
    return EMPTY;
  }

  const raw = window.localStorage.getItem(ROUTINE_STORAGE_KEY);

  if (!raw) {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = migrateLegacyV1(legacyRaw);
      if (migrated) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        const ready = bundleForToday(migrated);
        saveRoutineBundle(ready);
        return ready;
      }
    }
    return EMPTY;
  }

  try {
    const parsed = JSON.parse(raw) as RoutineBundle;
    const normalized: RoutineBundle = {
      plan: normalizePlan(parsed.plan),
      run: parsed.run ?? null,
    };
    const ready = bundleForToday(normalized);
    if (JSON.stringify(ready) !== raw) {
      saveRoutineBundle(ready);
    }
    return ready;
  } catch {
    return EMPTY;
  }
}

/** Enregistre et previent les composants (meme onglet + autres onglets via `storage`). */
export function saveRoutineBundle(bundle: RoutineBundle): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(bundle));
  window.dispatchEvent(new Event(ROUTINE_CHANGED_EVENT));
}

export function saveRoutinePlan(features: RoutinePlanFeatures): RoutineBundle {
  const current = loadRoutineBundle();
  const plan: RoutinePlan = {
    id: newPlanId(),
    features,
    updatedAt: new Date().toISOString(),
  };
  const next: RoutineBundle = {
    ...current,
    plan,
    run: null,
  };
  saveRoutineBundle(next);
  return next;
}

export function startRoutineRun(): RoutineBundle {
  const current = loadRoutineBundle();
  if (!current.plan) return current;

  const targetCount = resolvePlanTargetCount(current.plan);
  if (targetCount <= 0) return current;

  const run: RoutineRun = {
    planId: current.plan.id,
    status: "in_progress",
    targetCount,
    doneCount: 0,
    lastUpdatedDate: todayKey(),
  };
  const next: RoutineBundle = { ...current, run };
  saveRoutineBundle(next);
  return next;
}

function planIncludesModule(plan: RoutinePlan, moduleId: RoutineModuleId): boolean {
  return Boolean(plan.features[moduleId]?.enabled);
}

export function incrementRoutineRun(
  bundle: RoutineBundle,
  moduleId: RoutineModuleId,
  amount = 1,
): RoutineBundle {
  if (!bundle.plan || !bundle.run) return bundle;
  if (bundle.run.planId !== bundle.plan.id) return bundle;
  if (bundle.run.status !== "in_progress") return bundle;
  if (!planIncludesModule(bundle.plan, moduleId)) return bundle;

  const nextDone = Math.min(
    bundle.run.targetCount,
    bundle.run.doneCount + Math.max(0, amount),
  );
  const nextStatus = nextDone >= bundle.run.targetCount ? "completed" : "in_progress";
  const next: RoutineBundle = {
    ...bundle,
    run: {
      ...bundle.run,
      doneCount: nextDone,
      status: nextStatus,
      lastUpdatedDate: todayKey(),
    },
  };
  saveRoutineBundle(next);
  return next;
}

export function trackRoutineModuleCompletion(moduleId: RoutineModuleId, amount = 1): void {
  incrementRoutineRun(loadRoutineBundle(), moduleId, amount);
}

export function getRoutineRunContextForModule(moduleId: RoutineModuleId): {
  bundle: RoutineBundle;
  canTrack: boolean;
  reason: "ok" | "no_plan" | "no_run" | "wrong_scope" | "not_in_progress" | "stale_run";
} {
  const bundle = loadRoutineBundle();
  if (!bundle.plan) {
    return { bundle, canTrack: false, reason: "no_plan" };
  }
  if (!bundle.run) {
    return { bundle, canTrack: false, reason: "no_run" };
  }
  if (bundle.run.planId !== bundle.plan.id) {
    return { bundle, canTrack: false, reason: "stale_run" };
  }
  if (bundle.run.status !== "in_progress") {
    return { bundle, canTrack: false, reason: "not_in_progress" };
  }
  if (!planIncludesModule(bundle.plan, moduleId)) {
    return { bundle, canTrack: false, reason: "wrong_scope" };
  }
  return { bundle, canTrack: true, reason: "ok" };
}
