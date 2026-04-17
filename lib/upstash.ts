import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

function normalizeRedisRestUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://")) return url;
  // Upstash SDK requires REST API URL (https), not Redis TCP URL (redis/rediss).
  if (url.startsWith("redis://") || url.startsWith("rediss://")) return undefined;
  return undefined;
}

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = normalizeRedisRestUrl(
    process.env.TOMAKUN_KV_REST_API_URL ??
      process.env.UPSTASH_REDIS_REST_URL ??
      process.env.TOMAKUN_REDIS_URL,
  );
  const token =
    process.env.TOMAKUN_KV_REST_API_TOKEN ??
    process.env.TOMAKUN_REDIS_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}
