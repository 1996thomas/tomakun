"use client";

import Link from "next/link";
import { useRoutineBundle } from "@/hooks/use-routine-bundle";
import { resolveFreeSessionTarget } from "@/lib/routine.storage";
import type { RoutineModuleId, RoutinePlan } from "@/types/routine";

function seriesLabel(moduleId: RoutineModuleId, plan: RoutinePlan): string {
  const slot = plan.features[moduleId];
  if (!slot.enabled) return "";
  const n = resolveFreeSessionTarget(slot.series, moduleId);
  return `${n} questions`;
}

export default function RoutinePageClient() {
  const [bundle] = useRoutineBundle();
  const plan = bundle.plan;
  const run = bundle.run;

  if (!plan) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="surface-card rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold">Routine</p>
          <p className="text-muted mt-2 text-sm">Aucune routine configuree.</p>
          <Link
            href="/"
            className="btn-primary mt-3 flex h-10 items-center justify-center rounded-lg text-sm font-medium"
          >
            Retour accueil
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col justify-center">
      <div className="surface-card rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold">Routine du jour</p>
        <p className="text-muted mt-1 text-xs">
          {run
            ? `Progression globale: ${run.doneCount}/${run.targetCount}`
            : "Lance ta routine depuis l'accueil."}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {plan.features.katakana.enabled && (
            <Link
              href="/kana?mode=routine"
              className="btn-option flex h-auto min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <span>Faire Katakana (routine)</span>
              <span className="text-muted text-xs">{seriesLabel("katakana", plan)}</span>
            </Link>
          )}
          {plan.features.hiragana.enabled && (
            <Link
              href="/hiragana?mode=routine"
              className="btn-option flex h-auto min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <span>Faire Hiragana (routine)</span>
              <span className="text-muted text-xs">{seriesLabel("hiragana", plan)}</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
