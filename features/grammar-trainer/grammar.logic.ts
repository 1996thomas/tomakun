import type { JLPTLevel } from "@/types/vocab";
import type { GrammarPoint } from "@/types/grammar";

export type GrammarQuestionType = "meaning_from_structure" | "structure_from_meaning" | "structure_from_example";

export type GrammarQuestion = {
  type: GrammarQuestionType;
  prompt: string;
  context?: string;
  choices: string[];
  answer: string;
};

export type GrammarSessionProgress = {
  index: number;
  total: number;
  correct: number;
  wrong: number;
};

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function pickDistractors(values: string[], answer: string, count: number): string[] {
  return shuffle(values.filter((value) => value !== answer)).slice(0, count);
}

export function getGrammarPool(
  byLevel: Record<JLPTLevel, GrammarPoint[]>,
  targetLevel: JLPTLevel,
  isCumulative: boolean,
): GrammarPoint[] {
  if (!isCumulative) return byLevel[targetLevel];
  const targetIdx = LEVELS.indexOf(targetLevel);
  const all: GrammarPoint[] = [];
  for (let i = 0; i <= targetIdx; i += 1) {
    all.push(...byLevel[LEVELS[i]]);
  }
  return all;
}

export function createSession(pool: GrammarPoint[], setSize: number): GrammarPoint[] {
  return shuffle(pool).slice(0, Math.min(pool.length, setSize));
}

export function createQuestion(item: GrammarPoint, pool: GrammarPoint[]): GrammarQuestion {
  const variants: GrammarQuestionType[] = [
    "meaning_from_structure",
    "structure_from_meaning",
    "structure_from_example",
  ];
  const type = variants[Math.floor(Math.random() * variants.length)];

  if (type === "structure_from_meaning") {
    const answer = item.structure;
    const options = unique(pool.map((entry) => entry.structure));
    const choices = shuffle([answer, ...pickDistractors(options, answer, 3)]);
    return {
      type,
      prompt: "Quelle structure correspond a ce sens ?",
      context: item.meaning,
      choices,
      answer,
    };
  }

  if (type === "structure_from_example") {
    const answer = item.structure;
    const options = unique(pool.map((entry) => entry.structure));
    const choices = shuffle([answer, ...pickDistractors(options, answer, 3)]);
    return {
      type,
      prompt: "Quelle structure est illustree par cet exemple ?",
      context: `${item.example}\n${item.exampleMeaning}`,
      choices,
      answer,
    };
  }

  const answer = item.meaning;
  const options = unique(pool.map((entry) => entry.meaning));
  const choices = shuffle([answer, ...pickDistractors(options, answer, 3)]);
  return {
    type: "meaning_from_structure",
    prompt: "Quel est le sens de cette structure ?",
    context: item.structure,
    choices,
    answer,
  };
}

export function isCorrectAnswer(question: GrammarQuestion, choice: string): boolean {
  return question.answer === choice;
}

export function updateProgress(
  progress: GrammarSessionProgress,
  isCorrect: boolean,
): GrammarSessionProgress {
  return {
    index: progress.index + 1,
    total: progress.total,
    correct: progress.correct + (isCorrect ? 1 : 0),
    wrong: progress.wrong + (isCorrect ? 0 : 1),
  };
}
