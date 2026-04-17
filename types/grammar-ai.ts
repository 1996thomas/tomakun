import type { GrammarQuestion } from "@/features/grammar-trainer/grammar.logic";
import type { Locale } from "@/lib/i18n.shared";
import type { GrammarPoint } from "@/types/grammar";

export type GrammarExplainRequest = {
  locale: Locale;
  question: GrammarQuestion;
  current: GrammarPoint;
  selectedChoice: string | null;
};

export type GrammarExplainResult = {
  ruleSummary: string;
  whyThisIsCorrect: string;
  whyCommonMistake: string;
  extraExampleJp: string;
  extraExampleRomaji: string;
  extraExampleTranslation: string;
  memoryTip: string;
};
