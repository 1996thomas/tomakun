import { NextResponse } from "next/server";
import { getRedis } from "@/lib/upstash";
import { getVocabMemoryTip } from "@/lib/ai/vocab-memory";
import type { VocabMemoryTipRequest, VocabAiQuota, VocabMemoryTipResult } from "@/types/vocab-ai";

const MAX_REQUESTS_PER_WINDOW = 6;
const RATE_WINDOW_MS = 60_000;
const DAILY_MAX_REQUESTS = 5;
const SAME_CARD_COOLDOWN_MS = 20_000;
const TIP_CACHE_TTL_SECONDS = 60 * 60 * 24;

function isValidRequest(body: unknown): body is VocabMemoryTipRequest {
  if (!body || typeof body !== "object") return false;
  const payload = body as Partial<VocabMemoryTipRequest>;
  const card = payload.card;
  if (!card) return false;
  return (
    (payload.locale === "fr" || payload.locale === "en") &&
    typeof card.id === "string" &&
    typeof card.word === "string" &&
    typeof card.reading === "string" &&
    typeof card.meaning === "string" &&
    typeof card.level === "string"
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

function getTipCacheKey(body: VocabMemoryTipRequest): string {
  return [
    "ai:vocab:tip",
    body.locale,
    encodeURIComponent(body.card.id),
    encodeURIComponent(body.card.word),
    encodeURIComponent(body.card.reading),
  ].join(":");
}

async function getQuotaSnapshot(clientIp: string): Promise<VocabAiQuota> {
  const redis = getRedis();
  if (!redis) {
    return {
      dailyMax: DAILY_MAX_REQUESTS,
      dailyUsed: 0,
      dailyRemaining: DAILY_MAX_REQUESTS,
      dailyResetInSeconds: getDailyResetInSeconds(),
    };
  }
  const dailyKey = `ai:vocab:daily:${clientIp}:${getDayKey()}`;
  const dailyRaw = await redis.get<number>(dailyKey);
  const dailyUsed = Number(dailyRaw ?? 0);
  return {
    dailyMax: DAILY_MAX_REQUESTS,
    dailyUsed,
    dailyRemaining: Math.max(0, DAILY_MAX_REQUESTS - dailyUsed),
    dailyResetInSeconds: getDailyResetInSeconds(),
  };
}

type GuardErrorCode = "RATE_LIMIT" | "DAILY_LIMIT" | "DUPLICATE" | "REDIS_MISSING";

async function enforceGuards(clientIp: string, body: VocabMemoryTipRequest): Promise<GuardErrorCode | null> {
  const redis = getRedis();
  if (!redis) return "REDIS_MISSING";

  const minuteBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const minuteKey = `ai:vocab:rl:${clientIp}:${minuteBucket}`;
  const dailyKey = `ai:vocab:daily:${clientIp}:${getDayKey()}`;
  const dedupeKey = `ai:vocab:dedupe:${clientIp}:${body.card.id}`;

  const minuteCount = await redis.incr(minuteKey);
  if (minuteCount === 1) await redis.expire(minuteKey, Math.ceil(RATE_WINDOW_MS / 1000));
  if (minuteCount > MAX_REQUESTS_PER_WINDOW) return "RATE_LIMIT";

  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) await redis.expire(dailyKey, 60 * 60 * 24 * 2);
  if (dailyCount > DAILY_MAX_REQUESTS) return "DAILY_LIMIT";

  const dedupeAccepted = await redis.set(dedupeKey, "1", {
    nx: true,
    ex: SAME_CARD_COOLDOWN_MS / 1000,
  });
  if (!dedupeAccepted) return "DUPLICATE";

  return null;
}

export async function GET(req: Request) {
  const quota = await getQuotaSnapshot(getClientIp(req));
  return NextResponse.json({ quota });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    if (!isValidRequest(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const clientIp = getClientIp(req);
    const redis = getRedis();
    const cacheKey = getTipCacheKey(body);

    if (redis) {
      const cachedTip = await redis.get<VocabMemoryTipResult>(cacheKey);
      if (cachedTip) {
        const quota = await getQuotaSnapshot(clientIp);
        return NextResponse.json({ tip: cachedTip, quota, cached: true });
      }
    }

    const guardError = await enforceGuards(clientIp, body);
    if (guardError) {
      const quota = await getQuotaSnapshot(clientIp);
      if (guardError === "REDIS_MISSING") {
        return NextResponse.json({ error: "Missing Upstash configuration.", quota }, { status: 500 });
      }
      if (guardError === "RATE_LIMIT") {
        return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute.", quota }, { status: 429 });
      }
      if (guardError === "DAILY_LIMIT") {
        return NextResponse.json(
          { error: `Daily limit reached (${DAILY_MAX_REQUESTS} memory tips/day).`, quota },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: "Tip already requested for this card.", quota }, { status: 429 });
    }

    const tip = await getVocabMemoryTip(body);
    if (redis) {
      await redis.set(cacheKey, tip, { ex: TIP_CACHE_TTL_SECONDS });
    }
    const quota = await getQuotaSnapshot(clientIp);
    return NextResponse.json({ tip, quota, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
