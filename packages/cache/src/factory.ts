import type { CelerityTracer } from "@celerity-sdk/types";
import type { CacheClient } from "./types";
import type { RedisCacheConfig } from "./providers/redis/types";
import { RedisCacheClient } from "./providers/redis/redis-cache-client";

export type CreateCacheClientOptions = {
  /** Redis connection config (resolved from ConfigService in the layer). */
  config: RedisCacheConfig;
  /** Optional tracer for Celerity-level span instrumentation. */
  tracer?: CelerityTracer;
};

/**
 * Creates a {@link CacheClient} using the Redis provider. All deploy targets
 * (AWS ElastiCache, GCP Memorystore, Azure Cache, local Valkey) speak the
 * Redis OSS protocol, so a single provider handles all environments.
 *
 * Unlike queue/topic which have per-cloud providers selected at runtime,
 * cache uses a single Redis provider for all deploy targets.
 */
export function createCacheClient(options: CreateCacheClientOptions): CacheClient {
  return new RedisCacheClient(options.config, options.tracer);
}
