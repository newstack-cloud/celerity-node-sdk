export type {
  CacheClient,
  CacheTransaction,
  CacheAuthMode,
  DeployTarget,
  ConnectionConfig,
  CacheConnectionInfo,
  CachePasswordAuth,
  CacheIamAuth,
  SetOptions,
  ScanOptions,
  SortedSetMember,
  SortedSetRangeOptions,
  SortedSetScoreRangeOptions,
  TransactionResult,
  TokenProvider,
  TokenProviderFactory,
} from "./types";

export { CacheError } from "./errors";

export {
  captureCacheLayerConfig,
  CONNECTION_PRESETS,
  resolveConnectionOverrides,
  resolveConnectionConfig,
} from "./config";
export type { CacheLayerConfig } from "./config";

export { resolveCacheCredentials } from "./credentials";

export { RedisCacheClient } from "./providers/redis/redis-cache-client";
export { RedisCache } from "./providers/redis/redis-cache";
export type { RedisCacheConfig } from "./providers/redis/types";
export { hashSlot, groupBySlot, assertSameSlot } from "./providers/redis/cluster";

export {
  ElastiCacheTokenProvider,
  createElastiCacheTokenProviderFactory,
} from "./providers/redis/iam/elasticache-token";

export { createCacheClient } from "./factory";
export type { CreateCacheClientOptions } from "./factory";

export {
  Cache,
  CacheCredentials,
  cacheToken,
  cacheCredentialsToken,
  cacheClientToken,
  DEFAULT_CACHE_TOKEN,
  DEFAULT_CACHE_CREDENTIALS_TOKEN,
} from "./decorators";

export { getCache, getCacheCredentials } from "./helpers";

export { CacheLayer } from "./layer";
