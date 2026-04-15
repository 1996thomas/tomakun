import type { JLPTLevel } from "@/types/vocab";

export type GrammarPoint = {
  id: string;
  structure: string;
  meaning: string;
  example: string;
  exampleMeaning: string;
  level: JLPTLevel;
};
