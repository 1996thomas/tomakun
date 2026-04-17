import type { Locale } from "@/lib/i18n.shared";
import type { Vocab } from "@/types/vocab";

export type VocabMemoryTipRequest = {
  locale: Locale;
  card: Vocab;
};

export type VocabMemoryTipResult = {
  mnemonic: string;
  readingHook: string;
  usageHint: string;
};

export type VocabAiQuota = {
  dailyMax: number;
  dailyUsed: number;
  dailyRemaining: number;
  dailyResetInSeconds: number;
};
