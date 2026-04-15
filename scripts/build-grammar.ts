import fs from "node:fs/promises";
import path from "node:path";
import type { GrammarPoint } from "../types/grammar";
import type { JLPTLevel } from "../types/vocab";

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

type InvalidRow = {
  sourceId: string;
  level: string;
  structure: string;
  reason: string;
};

type BuildReport = {
  generatedAt: string;
  totalRaw: number;
  totalProcessed: number;
  countsByLevel: Record<JLPTLevel, number>;
  confidenceByLevel: Record<
    JLPTLevel,
    {
      high: number;
      medium: number;
      low: number;
    }
  >;
  invalidRows: number;
  deduplicatedRows: number;
};

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const RAW_DIR = path.join(process.cwd(), "data", "raw");
const PROCESSED_DIR = path.join(process.cwd(), "data", "processed");

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalStructure(value: string): string {
  return normalize(value)
    .replace(/[〜～]/g, "~")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isLevel(value: string): value is JLPTLevel {
  return value === "N5" || value === "N4" || value === "N3" || value === "N2" || value === "N1";
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, "grammar_sources_raw.json");
  const rawEntries = await readJson<RawGrammarEntry[]>(rawPath);

  const invalidRows: InvalidRow[] = [];
  const grouped = new Map<string, RawGrammarEntry[]>();
  let deduplicatedRows = 0;

  for (const row of rawEntries) {
    const level = row.level;
    const structure = normalize(row.structure);
    const meaning = normalize(row.meaning);
    const example = normalize(row.example);
    const exampleMeaning = normalize(row.exampleMeaning);

    if (!isLevel(level)) {
      invalidRows.push({
        sourceId: row.sourceId ?? "unknown",
        level: String(row.level),
        structure,
        reason: "invalid_level",
      });
      continue;
    }
    if (!structure || !meaning || !example || !exampleMeaning) {
      invalidRows.push({
        sourceId: row.sourceId ?? "unknown",
        level,
        structure,
        reason: "missing_required_field",
      });
      continue;
    }

    const key = `${level}::${canonicalStructure(structure)}`;
    const next: RawGrammarEntry = {
      ...row,
      level,
      structure,
      meaning,
      example,
      exampleMeaning,
    };
    const prev = grouped.get(key) ?? [];
    if (prev.length > 0) deduplicatedRows += 1;
    prev.push(next);
    grouped.set(key, prev);
  }

  const confidenceByLevel: BuildReport["confidenceByLevel"] = {
    N5: { high: 0, medium: 0, low: 0 },
    N4: { high: 0, medium: 0, low: 0 },
    N3: { high: 0, medium: 0, low: 0 },
    N2: { high: 0, medium: 0, low: 0 },
    N1: { high: 0, medium: 0, low: 0 },
  };

  const processed: GrammarPoint[] = [];
  const countsByLevel: Record<JLPTLevel, number> = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 };

  for (const [key, rows] of grouped.entries()) {
    const [level] = key.split("::");
    if (!isLevel(level)) continue;
    const primary = rows[0];
    const sourceIds = new Set(rows.map((row) => row.sourceId));
    const sourceCount = sourceIds.size;
    if (sourceCount >= 2) confidenceByLevel[level].high += 1;
    else if (sourceCount === 1) confidenceByLevel[level].medium += 1;
    else confidenceByLevel[level].low += 1;

    countsByLevel[level] += 1;
    processed.push({
      id: `${level.toLowerCase()}-${String(countsByLevel[level]).padStart(4, "0")}`,
      structure: primary.structure,
      meaning: primary.meaning,
      example: primary.example,
      exampleMeaning: primary.exampleMeaning,
      level,
    });
  }

  for (const level of LEVELS) {
    const outPath = path.join(PROCESSED_DIR, `grammar_${level.toLowerCase()}.json`);
    const levelEntries = processed.filter((entry) => entry.level === level);
    await fs.writeFile(outPath, `${JSON.stringify(levelEntries, null, 2)}\n`, "utf8");
  }

  await fs.writeFile(
    path.join(RAW_DIR, "grammar_review_queue.json"),
    `${JSON.stringify(invalidRows, null, 2)}\n`,
    "utf8",
  );

  const report: BuildReport = {
    generatedAt: new Date().toISOString(),
    totalRaw: rawEntries.length,
    totalProcessed: processed.length,
    countsByLevel,
    confidenceByLevel,
    invalidRows: invalidRows.length,
    deduplicatedRows,
  };

  await fs.writeFile(
    path.join(RAW_DIR, "grammar_build_report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("Grammar build complete:", report);
}

main().catch((error) => {
  console.error("build-grammar failed:", error);
  process.exit(1);
});
