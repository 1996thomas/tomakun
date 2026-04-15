import fs from "node:fs/promises";
import path from "node:path";

type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";

type RawJlptEntry = {
  word: string;
  reading: string;
  level: JLPTLevel;
  meanings: string[];
};

type RawJmdictEntry = {
  word: string;
  reading: string;
  glosses?: string[];
};

type MissingEntry = {
  word: string;
  reading: string;
};

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForMatch(value: string): string {
  return normalizeText(value)
    .replace(/[／]/g, "/")
    .replace(/[　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitVariants(value: string): string[] {
  return normalizeForMatch(value)
    .split(/[\/・,]/)
    .map((part) => normalizeForMatch(part))
    .filter(Boolean);
}

function entryKey(word: string, reading: string, level?: JLPTLevel): string {
  const head = `${normalizeText(word)}::${normalizeText(reading)}`;
  return level ? `${level}::${head}` : head;
}

function firstNonEmpty(values: string[]): string {
  const found = values.find((value) => normalizeText(value).length > 0);
  return found ? normalizeText(found) : "";
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const rawDir = path.join(root, "data", "raw");
  const crosscheckDir = path.join(rawDir, "crosscheck");
  const jlptRawPath = path.join(rawDir, "jlpt_vocab_raw.json");
  const jmdictPath = path.join(rawDir, "jmdict_raw.json");
  const reviewQueuePath = path.join(crosscheckDir, "reconcile_review_queue.json");
  const reportPath = path.join(crosscheckDir, "reconcile_report.json");

  const jlptRaw = await readJsonFile<RawJlptEntry[]>(jlptRawPath);
  const jmdictRaw = await readJsonFile<RawJmdictEntry[]>(jmdictPath);

  const existingKeys = new Set<string>(
    jlptRaw.map((entry) => entryKey(entry.word, entry.reading, entry.level)),
  );

  const jmdictByExactKey = new Map<string, RawJmdictEntry>();
  const jmdictByWord = new Map<string, RawJmdictEntry[]>();
  const jmdictByReading = new Map<string, RawJmdictEntry[]>();
  for (const jmdict of jmdictRaw) {
    const wordVariants = splitVariants(jmdict.word);
    const readingVariants = splitVariants(jmdict.reading);
    for (const w of wordVariants) {
      const byWord = jmdictByWord.get(w) ?? [];
      byWord.push(jmdict);
      jmdictByWord.set(w, byWord);
      for (const r of readingVariants) {
        jmdictByExactKey.set(entryKey(w, r), jmdict);
      }
    }
    for (const r of readingVariants) {
      const byReading = jmdictByReading.get(r) ?? [];
      byReading.push(jmdict);
      jmdictByReading.set(r, byReading);
    }
  }

  const toAdd: RawJlptEntry[] = [];
  const reviewQueue: Array<MissingEntry & { level: JLPTLevel; reason: string }> = [];
  const perLevel = LEVELS.reduce<Record<JLPTLevel, { added: number; queued: number }>>(
    (acc, level) => {
      acc[level] = { added: 0, queued: 0 };
      return acc;
    },
    { N5: { added: 0, queued: 0 }, N4: { added: 0, queued: 0 }, N3: { added: 0, queued: 0 }, N2: { added: 0, queued: 0 }, N1: { added: 0, queued: 0 } },
  );

  for (const level of LEVELS) {
    const missingPath = path.join(crosscheckDir, `${level.toLowerCase()}_missing_from_primary.json`);
    const missingEntries = await readJsonFile<MissingEntry[]>(missingPath);

    for (const missing of missingEntries) {
      const scopedKey = entryKey(missing.word, missing.reading, level);
      if (existingKeys.has(scopedKey)) continue;

      const missingWordVariants = splitVariants(missing.word);
      const missingReadingVariants = splitVariants(missing.reading);

      let jmdictMatch: RawJmdictEntry | undefined;

      for (const w of missingWordVariants) {
        for (const r of missingReadingVariants) {
          const exact = jmdictByExactKey.get(entryKey(w, r));
          if (exact) {
            jmdictMatch = exact;
            break;
          }
        }
        if (jmdictMatch) break;
      }

      if (!jmdictMatch) {
        for (const w of missingWordVariants) {
          const candidates = jmdictByWord.get(w) ?? [];
          if (candidates.length === 1) {
            jmdictMatch = candidates[0];
            break;
          }
        }
      }

      if (!jmdictMatch) {
        for (const r of missingReadingVariants) {
          const candidates = jmdictByReading.get(r) ?? [];
          if (candidates.length === 1) {
            jmdictMatch = candidates[0];
            break;
          }
        }
      }

      const meaning = firstNonEmpty(jmdictMatch?.glosses ?? []);

      if (meaning.length > 0) {
        const normalizedWord = normalizeText(missing.word);
        const normalizedReading = normalizeText(missing.reading);
        const next: RawJlptEntry = {
          word: normalizedWord,
          reading: normalizedReading,
          level,
          meanings: [meaning],
        };
        toAdd.push(next);
        existingKeys.add(entryKey(normalizedWord, normalizedReading, level));
        perLevel[level].added += 1;
      } else {
        reviewQueue.push({
          level,
          word: normalizeText(missing.word),
          reading: normalizeText(missing.reading),
          reason: "missing_meaning_in_jmdict",
        });
        perLevel[level].queued += 1;
      }
    }
  }

  if (toAdd.length > 0) {
    const nextRaw = [...jlptRaw, ...toAdd];
    await fs.writeFile(jlptRawPath, `${JSON.stringify(nextRaw, null, 2)}\n`, "utf8");
  }

  await fs.writeFile(reviewQueuePath, `${JSON.stringify(reviewQueue, null, 2)}\n`, "utf8");
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        addedTotal: toAdd.length,
        queuedTotal: reviewQueue.length,
        perLevel,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        addedTotal: toAdd.length,
        queuedTotal: reviewQueue.length,
        perLevel,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("reconcile-crosscheck failed:", error);
  process.exit(1);
});
