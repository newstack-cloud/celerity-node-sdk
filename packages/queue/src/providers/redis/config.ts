import type { RedisQueueConfig } from "./types";

const DEFAULT_REDIS_URL = "redis://localhost:6379";

/**
 * Captures Redis configuration from environment variables.
 * This is the only place that reads `process.env` for Redis config.
 */
export function captureRedisConfig(): RedisQueueConfig {
  return {
    url: process.env.CELERITY_REDIS_ENDPOINT ?? DEFAULT_REDIS_URL,
  };
}
