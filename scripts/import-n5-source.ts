import fs from "node:fs/promises";
import https from "node:https";

type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";

type SourceEntry = {
  word?: string;
  meaning?: string;
  furigana?: string;
  level?: number;
};

type RawJlptEntry = {
  word: string;
  reading: string;
  level: JLPTLevel;
  meanings: string[];
};

type SecondaryN5Entry = {
  word: string;
  reading: string;
};

const PRIMARY_BASE_URL =
  "https://raw.githubusercontent.com/wkei/jlpt-vocab-api/main/data-source/db";
const SECONDARY_N5_CSV_URL =
  "https://raw.githubusercontent.com/Bluskyo/JLPT_Vocabulary/main/data/parsedData/n5_vocab_cleaned.csv";
const SECONDARY_BASE_URL =
  "https://raw.githubusercontent.com/Bluskyo/JLPT_Vocabulary/main/data/parsedData";
const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Failed download: HTTP ${res.statusCode}`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseLevelJson(raw: string): SourceEntry[] {
  return JSON.parse(raw) as SourceEntry[];
}

function toRawJlpt(entries: SourceEntry[], level: JLPTLevel): RawJlptEntry[] {
  return entries
    .map((entry) => {
      const word = (entry.word ?? "").trim();
      const reading = ((entry.furigana ?? "").trim() || word).trim();
      const meanings = (entry.meaning ?? "")
        .split(";")
        .map((m) => m.trim())
        .filter(Boolean);

      return {
        word,
        reading,
        level,
        meanings: meanings.length > 0 ? meanings : ["(missing meaning)"],
      };
    })
    .filter((entry) => entry.word.length > 0 && entry.reading.length > 0);
}

function parseN5Csv(rawCsv: string): SecondaryN5Entry[] {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const rows = lines.slice(1);
  return rows
    .map((row) => {
      const commaIdx = row.indexOf(",");
      if (commaIdx < 0) return null;
      const word = row.slice(0, commaIdx).trim();
      const reading = row.slice(commaIdx + 1).trim();
      if (!word || !reading) return null;
      return { word, reading };
    })
    .filter((entry): entry is SecondaryN5Entry => entry !== null);
}

function key(word: string, reading: string): string {
  return `${word}::${reading}`;
}

type LevelCrossCheckReport = {
  level: JLPTLevel;
  primaryCount: number;
  secondaryCount: number;
  missingFromPrimary: number;
  missingFromSecondary: number;
};

type MissingEntry = {
  word: string;
  reading: string;
};

function reconcileN5WithSecondary(primaryAll: RawJlptEntry[], secondaryN5: SecondaryN5Entry[]): {
  merged: RawJlptEntry[];
  report: {
    primaryN5Count: number;
    secondaryN5Count: number;
    missingFromPrimaryN5: number;
    readingCorrections: number;
  };
} {
  const merged = [...primaryAll];
  const n5Indexes: number[] = [];
  for (let i = 0; i < merged.length; i += 1) {
    if (merged[i].level === "N5") n5Indexes.push(i);
  }

  const indexByExactKey = new Map<string, number>();
  const indexByWord = new Map<string, number[]>();
  for (const idx of n5Indexes) {
    const item = merged[idx];
    indexByExactKey.set(key(item.word, item.reading), idx);
    const list = indexByWord.get(item.word) ?? [];
    list.push(idx);
    indexByWord.set(item.word, list);
  }

  let missingFromPrimaryN5 = 0;
  let readingCorrections = 0;

  for (const entry of secondaryN5) {
    if (indexByExactKey.has(key(entry.word, entry.reading))) continue;

    const candidates = indexByWord.get(entry.word) ?? [];
    if (candidates.length === 1) {
      const idx = candidates[0];
      if (merged[idx].reading === merged[idx].word) {
        merged[idx] = {
          ...merged[idx],
          reading: entry.reading,
        };
        readingCorrections += 1;
        indexByExactKey.set(key(entry.word, entry.reading), idx);
      } else {
        missingFromPrimaryN5 += 1;
      }
    } else if (candidates.length > 1) {
      missingFromPrimaryN5 += 1;
    } else {
      missingFromPrimaryN5 += 1;
    }
  }

  return {
    merged,
    report: {
      primaryN5Count: n5Indexes.length,
      secondaryN5Count: secondaryN5.length,
      missingFromPrimaryN5,
      readingCorrections,
    },
  };
}

function crossCheckLevel(
  level: JLPTLevel,
  primaryEntries: RawJlptEntry[],
  secondaryEntries: SecondaryN5Entry[],
): {
  report: LevelCrossCheckReport;
  missingFromPrimary: MissingEntry[];
  missingFromSecondary: MissingEntry[];
} {
  const primaryLevel = primaryEntries.filter((entry) => entry.level === level);
  const primaryKeys = new Set(primaryLevel.map((entry) => key(entry.word, entry.reading)));
  const secondaryKeys = new Set(
    secondaryEntries.map((entry) => key(entry.word, entry.reading)),
  );

  const missingFromPrimary = secondaryEntries.filter(
    (entry) => !primaryKeys.has(key(entry.word, entry.reading)),
  );
  const missingFromSecondary = primaryLevel
    .filter((entry) => !secondaryKeys.has(key(entry.word, entry.reading)))
    .map((entry) => ({ word: entry.word, reading: entry.reading }));

  return {
    report: {
      level,
      primaryCount: primaryLevel.length,
      secondaryCount: secondaryEntries.length,
      missingFromPrimary: missingFromPrimary.length,
      missingFromSecondary: missingFromSecondary.length,
    },
    missingFromPrimary,
    missingFromSecondary,
  };
}

async function main(): Promise<void> {
  const outputPath = "data/raw/jlpt_vocab_raw.json";
  const reportPath = "data/raw/import_report.json";
  const crosscheckDir = "data/raw/crosscheck";

  const perLevel = await Promise.all(
    LEVELS.map(async (level) => {
      const source = await download(`${PRIMARY_BASE_URL}/${level.toLowerCase()}.json`);
      const parsed = parseLevelJson(source);
      return toRawJlpt(parsed, level);
    }),
  );

  const primaryAll = perLevel.flat();
  const secondaryN5Csv = await download(SECONDARY_N5_CSV_URL);
  const secondaryN5 = parseN5Csv(secondaryN5Csv);
  const reconciled = reconcileN5WithSecondary(primaryAll, secondaryN5);

  await fs.writeFile(outputPath, `${JSON.stringify(reconciled.merged, null, 2)}\n`, "utf8");
  await fs.mkdir(crosscheckDir, { recursive: true });

  const secondaryPerLevel = await Promise.all(
    LEVELS.map(async (level) => {
      const csv = await download(
        `${SECONDARY_BASE_URL}/${level.toLowerCase()}_vocab_cleaned.csv`,
      );
      return {
        level,
        entries: parseN5Csv(csv),
      };
    }),
  );

  const crosscheckSummary: LevelCrossCheckReport[] = [];
  for (const secondary of secondaryPerLevel) {
    const checked = crossCheckLevel(secondary.level, reconciled.merged, secondary.entries);
    crosscheckSummary.push(checked.report);

    const baseName = secondary.level.toLowerCase();
    await fs.writeFile(
      `${crosscheckDir}/${baseName}_missing_from_primary.json`,
      `${JSON.stringify(checked.missingFromPrimary, null, 2)}\n`,
      "utf8",
    );
    await fs.writeFile(
      `${crosscheckDir}/${baseName}_missing_from_secondary.json`,
      `${JSON.stringify(checked.missingFromSecondary, null, 2)}\n`,
      "utf8",
    );
  }

  const perLevelCounts = LEVELS.reduce<Record<JLPTLevel, number>>((acc, level) => {
    acc[level] = reconciled.merged.filter((entry) => entry.level === level).length;
    return acc;
  }, { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 });

  const report = {
    source: {
      primary: "wkei/jlpt-vocab-api (data-source/db/*.json)",
      secondaryAllLevels: "Bluskyo/JLPT_Vocabulary (parsedData/*_vocab_cleaned.csv)",
    },
    counts: perLevelCounts,
    n5CrossCheck: reconciled.report,
    crossCheckByLevel: crosscheckSummary,
    crossCheckFiles: "data/raw/crosscheck/*.json",
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Import complete:", report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
