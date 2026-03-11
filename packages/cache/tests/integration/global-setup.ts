import Redis from "ioredis";

const REDIS_URL = "redis://localhost:6399";

export async function setup() {
  const redis = new Redis(REDIS_URL);
  try {
    // Flush the DB used for cache integration tests
    await redis.flushdb();
  } catch {
    // Ignore if Redis is not ready
  }
  await redis.quit();
}

export async function teardown() {
  const redis = new Redis(REDIS_URL);
  try {
    await redis.flushdb();
  } catch {
    // Ignore cleanup errors
  }
  await redis.quit();
}
