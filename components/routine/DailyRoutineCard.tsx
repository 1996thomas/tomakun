"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoutineBundle } from "@/hooks/use-routine-bundle";
import {
  createDefaultRoutineFeatures,
  resolvePlanTargetCount,
  saveRoutinePlan,
  startRoutineRun,
} from "@/lib/routine.storage";
import type {
  RoutineModuleId,
  RoutinePlanFeatures,
  RoutineSeries,
} from "@/types/routine";
import { ROUTINE_MODULE_IDS } from "@/types/routine";

function cloneFeatures(features: RoutinePlanFeatures): RoutinePlanFeatures {
  return {
    katakana: { ...features.katakana },
    hiragana: { ...features.hiragana },
  };
}

export default function DailyRoutineCard() {
  const router = useRouter();
  const [bundle, refresh] = useRoutineBundle();
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isRedoModalOpen, setIsRedoModalOpen] = useState(false);
  const [draftFeatures, setDraftFeatures] = useState<RoutinePlanFeatures>(() =>
    createDefaultRoutineFeatures(),
  );

  const plan = bundle.plan;
  const run = bundle.run;
  const targetPreview = plan ? resolvePlanTargetCount(plan) : 0;
  const done = run?.doneCount ?? 0;
  const target = run?.targetCount ?? targetPreview;
  const percent =
    target > 0 && run ? Math.min(100, Math.round((done / target) * 100)) : 0;

  const isRunActive = run?.status === "in_progress";
  const isRunDone = run?.status === "completed";

  const draftHasEnabled = ROUTINE_MODULE_IDS.some((id) => draftFeatures[id].enabled);

  function openPlanModal(): void {
    if (plan) {
      setDraftFeatures(cloneFeatures(plan.features));
    } else {
      setDraftFeatures(createDefaultRoutineFeatures());
    }
    setIsPlanModalOpen(true);
  }

  function handleSavePlan(): void {
    if (!draftHasEnabled) return;
    saveRoutinePlan(cloneFeatures(draftFeatures));
    refresh();
    setIsPlanModalOpen(false);
  }

  function handleStartRoutine(): void {
    if (!plan || targetPreview <= 0) return;
    startRoutineRun();
    refresh();
    router.push("/routine");
  }

  function handleResumeRoutine(): void {
    router.push("/routine");
  }

  function handleConfirmRedo(): void {
    if (!plan || targetPreview <= 0) return;
    startRoutineRun();
    refresh();
    setIsRedoModalOpen(false);
    router.push("/routine");
  }

  function formatSeriesShort(series: RoutineSeries): string {
    if (series === "short") return "10";
    if (series === "medium") return "30";
    return "Full";
  }

  function formatPlanSummary(p: typeof plan): string {
    if (!p) return "";
    const parts: string[] = [];
    for (const id of ROUTINE_MODULE_IDS) {
      const slot = p.features[id];
      if (!slot.enabled) {
        parts.push(`${id === "katakana" ? "Katakana" : "Hiragana"}: pas aujourd'hui`);
      } else {
        parts.push(
          `${id === "katakana" ? "Katakana" : "Hiragana"}: ${formatSeriesShort(slot.series)}`,
        );
      }
    }
    return parts.join(" · ");
  }

  function setModuleEnabled(moduleId: RoutineModuleId, enabled: boolean): void {
    setDraftFeatures((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], enabled },
    }));
  }

  function setModuleSeries(moduleId: RoutineModuleId, series: RoutineSeries): void {
    setDraftFeatures((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], series },
    }));
  }

  return (
    <div id="ma-routine" className="surface-card mb-4 scroll-mt-20 rounded-xl p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Ma routine du jour</p>
        <p className="text-muted shrink-0 text-xs">
          {!plan && "Non configuree"}
          {plan && !run && "Prete a lancer"}
          {isRunActive && "En cours"}
          {isRunDone && "Terminee"}
        </p>
      </div>

      {!plan && (
        <p className="text-muted mb-3 text-xs leading-relaxed">
          Enregistre une fois tes modules (katakana / hiragana) et la taille des series. Tu pourras
          lancer ou reprendre depuis ici ou suivre le badge « Routine » dans la barre du haut.
        </p>
      )}

      {!plan && (
        <button
          type="button"
          onClick={openPlanModal}
          className="btn-primary h-10 w-full rounded-lg text-sm font-medium"
        >
          Creer ma routine
        </button>
      )}

      {plan && (
        <>
          <p className="text-muted text-xs leading-relaxed">{formatPlanSummary(plan)}</p>
          <p className="text-muted mt-1 text-xs">Objectif total: {targetPreview} questions</p>

          {run && (
            <>
              <div className="progress-track mt-2 h-2 w-full rounded-full">
                <div
                  className="progress-fill h-full rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-muted mt-1 text-xs">
                Progression: {done}/{target}
              </p>
            </>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {!run && (
              <button
                type="button"
                onClick={handleStartRoutine}
                disabled={targetPreview <= 0}
                className="btn-primary h-10 w-full rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                Commencer ma routine
              </button>
            )}
            {isRunActive && (
              <button
                type="button"
                onClick={handleResumeRoutine}
                className="btn-primary h-10 w-full rounded-lg text-sm font-medium"
              >
                Reprendre ma routine
              </button>
            )}
            {isRunDone && (
              <button
                type="button"
                onClick={() => setIsRedoModalOpen(true)}
                disabled={targetPreview <= 0}
                className="btn-primary h-10 w-full rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                Refaire ma routine
              </button>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openPlanModal}
                className="btn-option h-10 w-full rounded-lg text-sm font-medium sm:flex-1"
              >
                Modifier ma routine
              </button>
              <Link
                href="/routine"
                className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium sm:flex-1"
              >
                Hub routine
              </Link>
            </div>
          </div>

          {isRunActive && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {plan.features.katakana.enabled && (
                <Link
                  href="/kana?mode=routine"
                  className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
                >
                  Katakana (routine)
                </Link>
              )}
              {plan.features.hiragana.enabled && (
                <Link
                  href="/hiragana?mode=routine"
                  className="btn-option flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium"
                >
                  Hiragana (routine)
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {isPlanModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="surface-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">
              {plan ? "Modifier ma routine" : "Creer ma routine"}
            </p>
            <p className="text-muted mt-1 text-xs">
              Pour chaque feature, indique si tu t&apos;exerces aujourd&apos;hui et quelle serie.
            </p>

            <div className="mt-4 space-y-4">
              {ROUTINE_MODULE_IDS.map((moduleId) => {
                const slot = draftFeatures[moduleId];
                const label = moduleId === "katakana" ? "Katakana" : "Hiragana";
                return (
                  <div key={moduleId} className="routine-feature-slot rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{label}</p>
                      <button
                        type="button"
                        onClick={() => setModuleEnabled(moduleId, !slot.enabled)}
                        className={[
                          "rounded-md px-2 py-1 text-xs font-medium",
                          slot.enabled ? "btn-primary" : "btn-option",
                        ].join(" ")}
                      >
                        {slot.enabled ? "Inclus" : "Pas aujourd'hui"}
                      </button>
                    </div>
                    {slot.enabled && (
                      <div className="mt-2">
                        <p className="text-muted mb-1 text-xs">Serie pour {label}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(["short", "medium", "long"] as RoutineSeries[]).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setModuleSeries(moduleId, s)}
                              className={[
                                "h-9 rounded-lg text-xs font-medium transition",
                                slot.series === s ? "btn-primary" : "btn-option",
                              ].join(" ")}
                            >
                              {s === "short" ? "10" : s === "medium" ? "30" : "Full"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!draftHasEnabled && (
              <p className="feedback-wrong mt-3 text-xs">
                Active au moins une feature pour enregistrer ta routine.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={!draftHasEnabled}
                className="btn-primary h-10 flex-1 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="btn-option h-10 flex-1 rounded-lg text-sm font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {isRedoModalOpen && plan && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="surface-card w-full max-w-md rounded-xl p-4 shadow-lg">
            <p className="text-sm font-semibold">Refaire la routine</p>
            <p className="text-muted mt-1 text-xs">
              Tes compteurs du jour seront remis a zero et une nouvelle session demarrera.
            </p>
            <p className="text-muted mt-2 text-xs leading-relaxed">{formatPlanSummary(plan)}</p>
            <p className="text-muted mt-1 text-xs">Total: {targetPreview} questions</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmRedo}
                disabled={targetPreview <= 0}
                className="btn-primary h-10 flex-1 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setIsRedoModalOpen(false)}
                className="btn-option h-10 flex-1 rounded-lg text-sm font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
