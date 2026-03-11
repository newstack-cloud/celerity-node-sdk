import Redis from "ioredis";

const REDIS_URL = "redis://localhost:6399";
const KEY_PREFIX = "test:";

export async function setup() {
  const redis = new Redis(REDIS_URL);
  try {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore if Redis is not ready
  }
  await redis.quit();
}

export async function teardown() {
  const redis = new Redis(REDIS_URL);
  try {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Ignore cleanup errors
  }
  await redis.quit();
}
