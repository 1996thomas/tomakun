import fs from "node:fs/promises";
import path from "node:path";
import type { JLPTLevel } from "../types/vocab";

type SourceGrammarEntry = {
  id?: number | string;
  grammar?: string;
  meaning?: string;
  example?: string;
  exampleMeaning?: string;
  japaneseSentence?: string;
  englishSentence?: string;
  level?: number;
};

type RawGrammarEntry = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceReliability: "community-curated";
  importedAt: string;
  level: JLPTLevel;
  structure: string;
  meaning: string;
  example: string;
  exampleMeaning: string;
};

type ImportReport = {
  generatedAt: string;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    levelsAvailable: JLPTLevel[];
    levelsMissing: JLPTLevel[];
  }>;
  countsByLevel: Record<JLPTLevel, number>;
  totalImported: number;
};

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const RAW_DIR = path.join(process.cwd(), "data", "raw");

const PRIMARY_SOURCE = {
  sourceId: "jlpt-grammar-api",
  sourceName: "JLPT Grammar API",
  baseUrl: "https://jlpt-grammar-api.vercel.app/api/grammar",
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function pickFirst(...values: Array<string | undefined>): string {
  for (const raw of values) {
    const next = normalize(raw ?? "");
    if (next.length > 0) return next;
  }
  return "";
}

function splitExample(rawExample: string): { example: string; exampleMeaning: string } {
  const cleaned = normalize(rawExample);
  if (!cleaned) return { example: "", exampleMeaning: "" };

  const separator = " - ";
  const sepIdx = cleaned.lastIndexOf(separator);
  if (sepIdx < 0) {
    return { example: cleaned, exampleMeaning: "" };
  }

  return {
    example: normalize(cleaned.slice(0, sepIdx)),
    exampleMeaning: normalize(cleaned.slice(sepIdx + separator.length)),
  };
}

async function fetchLevel(level: JLPTLevel): Promise<SourceGrammarEntry[] | null> {
  const url = `${PRIMARY_SOURCE.baseUrl}/${level.toLowerCase()}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed ${url}: HTTP ${response.status}`);
  }
  const parsed = (await response.json()) as SourceGrammarEntry[];
  return Array.isArray(parsed) ? parsed : [];
}

function toRawEntry(level: JLPTLevel, sourceUrl: string, item: SourceGrammarEntry): RawGrammarEntry | null {
  const structure = pickFirst(item.grammar);
  const meaning = pickFirst(item.meaning);
  const exampleBundle = splitExample(pickFirst(item.example));
  const example = pickFirst(exampleBundle.example, item.japaneseSentence);
  const exampleMeaning = pickFirst(exampleBundle.exampleMeaning, item.exampleMeaning, item.englishSentence);

  if (!structure || !meaning || !example || !exampleMeaning) return null;

  return {
    sourceId: PRIMARY_SOURCE.sourceId,
    sourceName: PRIMARY_SOURCE.sourceName,
    sourceUrl,
    sourceReliability: "community-curated",
    importedAt: new Date().toISOString(),
    level,
    structure,
    meaning,
    example,
    exampleMeaning,
  };
}

async function main(): Promise<void> {
  await fs.mkdir(RAW_DIR, { recursive: true });

  const collected: RawGrammarEntry[] = [];
  const levelsAvailable: JLPTLevel[] = [];
  const levelsMissing: JLPTLevel[] = [];

  for (const level of LEVELS) {
    const sourceUrl = `${PRIMARY_SOURCE.baseUrl}/${level.toLowerCase()}`;
    const entries = await fetchLevel(level);
    if (entries === null) {
      levelsMissing.push(level);
      continue;
    }

    levelsAvailable.push(level);
    for (const item of entries) {
      const mapped = toRawEntry(level, sourceUrl, item);
      if (mapped) collected.push(mapped);
    }
  }

  const countsByLevel = LEVELS.reduce<Record<JLPTLevel, number>>(
    (acc, level) => {
      acc[level] = collected.filter((entry) => entry.level === level).length;
      return acc;
    },
    { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 },
  );

  const report: ImportReport = {
    generatedAt: new Date().toISOString(),
    sources: [
      {
        sourceId: PRIMARY_SOURCE.sourceId,
        sourceName: PRIMARY_SOURCE.sourceName,
        sourceUrl: PRIMARY_SOURCE.baseUrl,
        levelsAvailable,
        levelsMissing,
      },
    ],
    countsByLevel,
    totalImported: collected.length,
  };

  await fs.writeFile(
    path.join(RAW_DIR, "grammar_sources_raw.json"),
    `${JSON.stringify(collected, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(RAW_DIR, "grammar_import_report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("Grammar import complete:", report);
}

main().catch((error) => {
  console.error("import-grammar-sources failed:", error);
  process.exit(1);
});
