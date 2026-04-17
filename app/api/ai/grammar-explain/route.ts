import { NextResponse } from "next/server";
import { explainGrammarWithOpenRouter } from "@/lib/ai/grammar-explain";
import type { Locale } from "@/lib/i18n.shared";
import { getRedis } from "@/lib/upstash";
import type { GrammarExplainRequest, GrammarExplainResult } from "@/types/grammar-ai";

const MAX_REQUESTS_PER_WINDOW = 8;
const RATE_WINDOW_MS = 60_000;
const SAME_QUESTION_COOLDOWN_MS = 20_000;
const DAILY_MAX_REQUESTS = 5;
const EXPLAIN_CACHE_TTL_SECONDS = 60 * 60 * 24;

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "fr";
}

function isValidRequest(body: unknown): body is GrammarExplainRequest {
  if (!body || typeof body !== "object") return false;
  const payload = body as Partial<GrammarExplainRequest>;
  const question = payload.question;
  const current = payload.current;

  if (!question || !current) return false;
  if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 8) {
    return false;
  }
  if (
    typeof question.prompt !== "string" ||
    question.prompt.length < 3 ||
    question.prompt.length > 240 ||
    typeof question.answer !== "string" ||
    question.answer.length < 1 ||
    question.answer.length > 120 ||
    typeof question.type !== "string"
  ) {
    return false;
  }
  if (
    typeof current.id !== "string" ||
    typeof current.structure !== "string" ||
    typeof current.meaning !== "string" ||
    typeof current.example !== "string" ||
    typeof current.exampleMeaning !== "string" ||
    typeof current.level !== "string"
  ) {
    return false;
  }

  return (
    isLocale(payload.locale) &&
    question.choices.every((choice) => typeof choice === "string" && choice.length <= 120) &&
    question.choices.includes(question.answer) &&
    current.id.length <= 120 &&
    current.structure.length <= 240 &&
    current.meaning.length <= 240 &&
    current.example.length <= 480 &&
    current.exampleMeaning.length <= 480 &&
    (typeof payload.selectedChoice === "string" || payload.selectedChoice === null)
  );
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  return xff.split(",")[0]?.trim() || "unknown";
}

function getDayKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
}

function getDailyResetInSeconds(now = new Date()): number {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((nextUtcMidnight - now.getTime()) / 1000));
}

function getMinuteResetInSeconds(nowMs = Date.now()): number {
  return Math.max(1, Math.ceil((RATE_WINDOW_MS - (nowMs % RATE_WINDOW_MS)) / 1000));
}

function getExplanationCacheKey(body: GrammarExplainRequest): string {
  return [
    "ai:grammar:explain",
    body.locale,
    encodeURIComponent(body.current.id),
    encodeURIComponent(body.question.type),
    encodeURIComponent(body.question.answer),
    encodeURIComponent(body.question.prompt),
  ].join(":");
}

type QuotaSnapshot = {
  dailyMax: number;
  dailyUsed: number;
  dailyRemaining: number;
  dailyResetInSeconds: number;
  minuteMax: number;
  minuteUsed: number;
  minuteRemaining: number;
  minuteResetInSeconds: number;
};

async function getQuotaSnapshot(clientIp: string): Promise<QuotaSnapshot> {
  const redis = getRedis();
  if (!redis) {
    return {
      dailyMax: DAILY_MAX_REQUESTS,
      dailyUsed: 0,
      dailyRemaining: DAILY_MAX_REQUESTS,
      dailyResetInSeconds: getDailyResetInSeconds(),
      minuteMax: MAX_REQUESTS_PER_WINDOW,
      minuteUsed: 0,
      minuteRemaining: MAX_REQUESTS_PER_WINDOW,
      minuteResetInSeconds: getMinuteResetInSeconds(),
    };
  }

  const minuteBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const minuteKey = `ai:grammar:rl:${clientIp}:${minuteBucket}`;
  const dailyKey = `ai:grammar:daily:${clientIp}:${getDayKey()}`;
  const [minuteRaw, dailyRaw] = await Promise.all([redis.get<number>(minuteKey), redis.get<number>(dailyKey)]);

  const minuteUsed = Number(minuteRaw ?? 0);
  const dailyUsed = Number(dailyRaw ?? 0);
  return {
    dailyMax: DAILY_MAX_REQUESTS,
    dailyUsed,
    dailyRemaining: Math.max(0, DAILY_MAX_REQUESTS - dailyUsed),
    dailyResetInSeconds: getDailyResetInSeconds(),
    minuteMax: MAX_REQUESTS_PER_WINDOW,
    minuteUsed,
    minuteRemaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - minuteUsed),
    minuteResetInSeconds: getMinuteResetInSeconds(),
  };
}

type GuardErrorCode = "MINUTE_LIMIT" | "DAILY_LIMIT" | "DUPLICATE" | "REDIS_MISSING";

async function enforceGuards(clientIp: string, body: GrammarExplainRequest): Promise<GuardErrorCode | null> {
  const redis = getRedis();
  if (!redis) {
    return "REDIS_MISSING";
  }

  const minuteBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const minuteKey = `ai:grammar:rl:${clientIp}:${minuteBucket}`;
  const dailyKey = `ai:grammar:daily:${clientIp}:${getDayKey()}`;
  const dedupeKey = `ai:grammar:dedupe:${clientIp}:${body.current.id}:${body.question.type}:${body.question.answer}`;

  const minuteCount = await redis.incr(minuteKey);
  if (minuteCount === 1) {
    await redis.expire(minuteKey, Math.ceil(RATE_WINDOW_MS / 1000));
  }
  if (minuteCount > MAX_REQUESTS_PER_WINDOW) {
    return "MINUTE_LIMIT";
  }

  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) {
    await redis.expire(dailyKey, 60 * 60 * 24 * 2);
  }
  if (dailyCount > DAILY_MAX_REQUESTS) {
    return "DAILY_LIMIT";
  }

  const dedupeAccepted = await redis.set(dedupeKey, "1", {
    nx: true,
    ex: SAME_QUESTION_COOLDOWN_MS / 1000,
  });
  if (!dedupeAccepted) {
    return "DUPLICATE";
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    if (!isValidRequest(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const clientIp = getClientIp(req);
    const redis = getRedis();
    const cacheKey = getExplanationCacheKey(body);

    if (redis) {
      const cachedExplanation = await redis.get<GrammarExplainResult>(cacheKey);
      if (cachedExplanation) {
        const quota = await getQuotaSnapshot(clientIp);
        return NextResponse.json({ explanation: cachedExplanation, quota, cached: true });
      }
    }

    const guardError = await enforceGuards(clientIp, body);
    if (guardError) {
      const quota = await getQuotaSnapshot(clientIp);
      if (guardError === "REDIS_MISSING") {
        return NextResponse.json(
          { error: "Missing Upstash configuration.", quota },
          { status: 500 },
        );
      }
      if (guardError === "MINUTE_LIMIT") {
        return NextResponse.json(
          { error: "Rate limit exceeded. Try again in a minute.", quota },
          { status: 429 },
        );
      }
      if (guardError === "DAILY_LIMIT") {
        return NextResponse.json(
          { error: `Daily limit reached (${DAILY_MAX_REQUESTS} explanations/day).`, quota },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: "Explanation already requested for this question.", quota },
        { status: 429 },
      );
    }

    const explanation = await explainGrammarWithOpenRouter(body);
    if (redis) {
      await redis.set(cacheKey, explanation, { ex: EXPLAIN_CACHE_TTL_SECONDS });
    }
    const quota = await getQuotaSnapshot(clientIp);
    return NextResponse.json({ explanation, quota, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  const quota = await getQuotaSnapshot(clientIp);
  return NextResponse.json({ quota });
}
