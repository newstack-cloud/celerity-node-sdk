import type { Closeable } from "@celerity-sdk/types";

export type CacheAuthMode = "password" | "iam";

export type DeployTarget = "functions" | "runtime";

export type ConnectionConfig = {
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  keepAliveMs: number;
  maxRetries: number;
  retryDelayMs: number;
  lazyConnect: boolean;
};

export type SetOptions = {
  /** TTL in seconds. */
  ttl?: number;
  /** Only set if key does not exist (NX). */
  ifNotExists?: boolean;
  /** Only set if key already exists (XX). */
  ifExists?: boolean;
};

export type ScanOptions = {
  /** Glob-style pattern to match keys (e.g., "session:*"). */
  match?: string;
  /** Hint for how many keys to return per iteration. */
  count?: number;
  /** Filter by data type ("string", "list", "set", "zset", "hash"). */
  type?: string;
};

export type SortedSetMember = {
  member: string;
  score: number;
};

export type SortedSetRangeOptions = {
  /** Reverse the order (highest to lowest rank). */
  reverse?: boolean;
  /** Include scores in the result (returns SortedSetMember[] instead of string[]). */
  withScores?: boolean;
};

export type SortedSetScoreRangeOptions = {
  /** Reverse the order (highest to lowest score). */
  reverse?: boolean;
  /** Include scores in the result. */
  withScores?: boolean;
  /** Pagination within the score range. */
  offset?: number;
  /** Maximum number of results. */
  count?: number;
};

/**
 * Result of a pipeline transaction (MULTI/EXEC).
 * Each entry corresponds to a queued command, in order.
 */
export type TransactionResult = {
  /** Per-command results in the order commands were queued. */
  results: unknown[];
};

/**
 * Write-only command builder for pipeline transactions.
 * Commands are queued (not executed) until the transaction commits.
 * Each method returns `this` for chaining.
 *
 * Read operations are not available — Redis MULTI/EXEC queues all
 * commands server-side and returns results only after EXEC.
 */
export interface CacheTransaction {
  // Core key-value
  set(key: string, value: string, options?: SetOptions): this;
  delete(key: string): this;
  getSet(key: string, value: string): this;
  append(key: string, value: string): this;

  // Counters
  incr(key: string, amount?: number): this;
  decr(key: string, amount?: number): this;
  incrFloat(key: string, amount: number): this;

  // Hash
  hashSet(key: string, fields: Record<string, string>): this;
  hashDelete(key: string, fields: string[]): this;
  hashIncr(key: string, field: string, amount?: number): this;

  // List
  listPush(key: string, values: string[], end?: "left" | "right"): this;
  listTrim(key: string, start: number, stop: number): this;

  // Set
  setAdd(key: string, members: string[]): this;
  setRemove(key: string, members: string[]): this;

  // Sorted set
  sortedSetAdd(key: string, members: SortedSetMember[]): this;
  sortedSetRemove(key: string, members: string[]): this;
  sortedSetIncr(key: string, member: string, amount: number): this;

  // Key management
  expire(key: string, seconds: number): this;
  persist(key: string): this;
  rename(key: string, newKey: string): this;
}

/**
 * Top-level cache client that manages the underlying ioredis connection
 * lifecycle (single-instance or cluster). Provides access to per-resource
 * {@link Cache} handles.
 */
export interface CacheClient extends Closeable {
  /**
   * Returns a {@link Cache} handle scoped to the given resource name.
   * The handle is a lightweight object — no network calls are made until
   * an operation is invoked.
   *
   * @param name The resource name used for tracing span attributes.
   * @param keyPrefix Key prefix for namespace isolation (local only).
   */
  cache(name: string, keyPrefix?: string): Cache;
}

/**
 * Provides all cache operations, scoped to a single cache resource.
 * Applies key prefix for namespace isolation and wraps operations
 * in Celerity-level tracing spans.
 */
export interface Cache {
  // Core Key-Value
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
  getSet(key: string, value: string): Promise<string | null>;
  append(key: string, value: string): Promise<number>;

  // Batch Key-Value
  mget(keys: string[]): Promise<(string | null)[]>;
  mset(entries: [string, string][]): Promise<void>;
  mdelete(keys: string[]): Promise<number>;

  // Key Management
  exists(key: string): Promise<boolean>;
  expire(key: string, seconds: number): Promise<boolean>;
  persist(key: string): Promise<boolean>;
  type(key: string): Promise<string | null>;
  rename(key: string, newKey: string): Promise<void>;
  scan(options?: ScanOptions): AsyncIterable<string>;

  // Counters
  incr(key: string, amount?: number): Promise<number>;
  decr(key: string, amount?: number): Promise<number>;
  incrFloat(key: string, amount: number): Promise<number>;

  // Hashes
  hashGet(key: string, field: string): Promise<string | null>;
  hashSet(key: string, fields: Record<string, string>): Promise<void>;
  hashDelete(key: string, fields: string[]): Promise<number>;
  hashGetAll(key: string): Promise<Record<string, string>>;
  hashExists(key: string, field: string): Promise<boolean>;
  hashIncr(key: string, field: string, amount?: number): Promise<number>;
  hashKeys(key: string): Promise<string[]>;
  hashLen(key: string): Promise<number>;

  // Lists
  listPush(key: string, values: string[], end?: "left" | "right"): Promise<number>;
  listPop(key: string, end?: "left" | "right", count?: number): Promise<string[]>;
  listRange(key: string, start: number, stop: number): Promise<string[]>;
  listLen(key: string): Promise<number>;
  listTrim(key: string, start: number, stop: number): Promise<void>;
  listIndex(key: string, index: number): Promise<string | null>;

  // Sets
  setAdd(key: string, members: string[]): Promise<number>;
  setRemove(key: string, members: string[]): Promise<number>;
  setMembers(key: string): Promise<string[]>;
  setIsMember(key: string, member: string): Promise<boolean>;
  setLen(key: string): Promise<number>;
  setUnion(keys: string[]): Promise<string[]>;
  setIntersect(keys: string[]): Promise<string[]>;
  setDiff(keys: string[]): Promise<string[]>;

  // Sorted Sets
  sortedSetAdd(key: string, members: SortedSetMember[]): Promise<number>;
  sortedSetRemove(key: string, members: string[]): Promise<number>;
  sortedSetScore(key: string, member: string): Promise<number | null>;
  sortedSetRank(key: string, member: string, reverse?: boolean): Promise<number | null>;
  sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | SortedSetMember[]>;
  sortedSetRangeByScore(
    key: string,
    min: number | "-inf",
    max: number | "+inf",
    options?: SortedSetScoreRangeOptions,
  ): Promise<string[] | SortedSetMember[]>;
  sortedSetIncr(key: string, member: string, amount: number): Promise<number>;
  sortedSetLen(key: string): Promise<number>;
  sortedSetCountByScore(key: string, min: number | "-inf", max: number | "+inf"): Promise<number>;
  sortedSetRemoveByRank(key: string, start: number, stop: number): Promise<number>;
  sortedSetRemoveByScore(key: string, min: number | "-inf", max: number | "+inf"): Promise<number>;

  // Transactions
  transaction(fn: (tx: CacheTransaction) => void): Promise<TransactionResult>;
}

export type CacheConnectionInfo = {
  host: string;
  port: number;
  tls: boolean;
  clusterMode: boolean;
  user?: string;
  authMode: CacheAuthMode;
  keyPrefix: string;
};

export type CachePasswordAuth = {
  /** AUTH password/token. `undefined` when no auth is configured (e.g. local Valkey). */
  authToken?: string;
};

export type CacheIamAuth = {
  /** Short-lived IAM authentication token. */
  token: string;
};

/**
 * DI-injectable service providing resolved connection configuration.
 * Available to users who want direct ioredis access (BYO client) for
 * advanced Redis features (pub/sub, streams, WATCH-based optimistic
 * locking, Lua scripting, pipelining, geo commands, HyperLogLog, bitmaps).
 */
export interface CacheCredentials {
  getConnectionInfo(): Promise<CacheConnectionInfo>;
  getPasswordAuth(): Promise<CachePasswordAuth>;
  getIamAuth(): Promise<CacheIamAuth>;
}

export interface TokenProvider {
  getToken(): Promise<string>;
}

export type TokenProviderFactory = (
  cacheId: string,
  userId: string,
  region: string,
) => TokenProvider;
