import fs from "node:fs/promises";
import path from "node:path";
import type { JLPTLevel, Vocab } from "../types/vocab";

type RawJlptEntry = {
  word: string;
  reading: string;
  level: JLPTLevel;
  meanings?: string[];
};

type RawJmdictEntry = {
  word: string;
  reading: string;
  glosses?: string[];
};

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const PROCESSED_DIR = path.join(process.cwd(), "data", "processed");

const SUPPORTED_LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildKey(word: string, reading: string): string {
  return `${normalizeText(word)}::${normalizeText(reading)}`;
}

function firstNonEmpty(values: string[]): string {
  const found = values.find((v) => normalizeText(v).length > 0);
  return found ? normalizeText(found) : "";
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function toVocabEntries(jlptRaw: RawJlptEntry[], jmdictRaw: RawJmdictEntry[]): Vocab[] {
  const jmdictByKey = new Map<string, RawJmdictEntry>();
  for (const entry of jmdictRaw) {
    jmdictByKey.set(buildKey(entry.word, entry.reading), entry);
  }

  const output: Vocab[] = [];
  const counters = new Map<JLPTLevel, number>();

  for (const source of jlptRaw) {
    if (!SUPPORTED_LEVELS.includes(source.level)) continue;

    const word = normalizeText(source.word);
    const reading = normalizeText(source.reading);
    if (!word || !reading) continue;

    const jmdictMatch = jmdictByKey.get(buildKey(word, reading));
    const sourceMeaning = firstNonEmpty(source.meanings ?? []);
    const fallbackMeaning = firstNonEmpty(jmdictMatch?.glosses ?? []);
    const meaning = sourceMeaning || fallbackMeaning;
    if (!meaning) continue;

    const count = (counters.get(source.level) ?? 0) + 1;
    counters.set(source.level, count);
    output.push({
      id: `${source.level.toLowerCase()}-${String(count).padStart(4, "0")}`,
      word,
      reading,
      meaning,
      level: source.level,
    });
  }

  return output;
}

async function main(): Promise<void> {
  const jlptPath = path.join(RAW_DIR, "jlpt_vocab_raw.json");
  const jmdictPath = path.join(RAW_DIR, "jmdict_raw.json");

  const jlptRaw = await readJsonFile<RawJlptEntry[]>(jlptPath);
  const jmdictRaw = await readJsonFile<RawJmdictEntry[]>(jmdictPath);

  const vocab = toVocabEntries(jlptRaw, jmdictRaw);
  await fs.mkdir(PROCESSED_DIR, { recursive: true });

  for (const level of SUPPORTED_LEVELS) {
    const levelVocab = vocab.filter((entry) => entry.level === level);
    const outPath = path.join(PROCESSED_DIR, `vocab_${level.toLowerCase()}.json`);
    await fs.writeFile(outPath, JSON.stringify(levelVocab, null, 2) + "\n", "utf8");
  }

  const n5Count = vocab.filter((entry) => entry.level === "N5").length;
  console.log(`Vocab pipeline complete. N5 entries: ${n5Count}`);
}

main().catch((error) => {
  console.error("build-vocab failed:", error);
  process.exit(1);
});
