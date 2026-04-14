export type RoutineModuleId = "katakana" | "hiragana";

export type RoutineSeries = "short" | "medium" | "long";
export type RoutineStatus = "idle" | "in_progress" | "completed";

/** Réglage d'une feature dans la routine (activée ou non + série si activée). */
export type RoutineModuleSlot = {
  enabled: boolean;
  series: RoutineSeries;
};

export const ROUTINE_MODULE_IDS: RoutineModuleId[] = ["katakana", "hiragana"];

export type RoutinePlanFeatures = Record<RoutineModuleId, RoutineModuleSlot>;

/** Ce que l'utilisateur enregistre via le questionnaire (persiste en local). */
export type RoutinePlan = {
  id: string;
  features: RoutinePlanFeatures;
  updatedAt: string;
};

/** Une exécution liée au plan (compteurs du jour). */
export type RoutineRun = {
  planId: string;
  status: RoutineStatus;
  targetCount: number;
  doneCount: number;
  lastUpdatedDate: string;
};

export type RoutineBundle = {
  plan: RoutinePlan | null;
  run: RoutineRun | null;
};
