import { KATAKANA_DATA, type KanaItem } from "./kana.data";

export type KanaQuestion = {
  kana: string;
  correctAnswer: string;
  options: string[];
};

function getRandomIndex(max: number): number {
  return Math.floor(Math.random() * max);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = getRandomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickRandomKana(data: KanaItem[]): KanaItem {
  return data[getRandomIndex(data.length)];
}

function getUniqueRomajiPool(): string[] {
  return Array.from(new Set(KATAKANA_DATA.map((item) => item.romaji)));
}

export function generateKanaQuestion(): KanaQuestion {
  const selected = pickRandomKana(KATAKANA_DATA);
  const romajiPool = getUniqueRomajiPool().filter(
    (romaji) => romaji !== selected.romaji,
  );
  const trapCandidates = selected.traps.filter((trap) => romajiPool.includes(trap));
  const trapWrongAnswers = shuffle(trapCandidates).slice(0, 3);

  const remainingSlots = 3 - trapWrongAnswers.length;
  const fallbackWrongAnswers =
    remainingSlots > 0
      ? shuffle(romajiPool.filter((romaji) => !trapWrongAnswers.includes(romaji))).slice(
          0,
          remainingSlots,
        )
      : [];
  const wrongAnswers = [...trapWrongAnswers, ...fallbackWrongAnswers];

  return {
    kana: selected.kana,
    correctAnswer: selected.romaji,
    options: shuffle([selected.romaji, ...wrongAnswers]),
  };
}
