import createDebug from "debug";
import type Redis from "ioredis";
import type { Cluster } from "ioredis";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import type {
  Cache,
  CacheTransaction,
  SetOptions,
  ScanOptions,
  SortedSetMember,
  SortedSetRangeOptions,
  SortedSetScoreRangeOptions,
  TransactionResult,
} from "../../types";
import { CacheError } from "../../errors";
import { groupBySlot, assertSameSlot } from "./cluster";

const debug = createDebug("celerity:cache:redis");

export class RedisCache implements Cache {
  constructor(
    private readonly resourceName: string,
    private readonly client: Redis | Cluster,
    private readonly clusterMode: boolean,
    private readonly tracer?: CelerityTracer,
    private readonly keyPrefix: string = "",
  ) {
    if (keyPrefix && /[{}]/.test(keyPrefix)) {
      throw new CacheError(
        `Key prefix "${keyPrefix}" must not contain "{" or "}" characters — ` +
          "they would corrupt Redis hash tag parsing for cluster slot assignment.",
        resourceName,
      );
    }

    if (keyPrefix && clusterMode) {
      debug(
        '%s: key prefix "%s" is active in cluster mode — ' +
          "ensure user keys use hash tags (e.g. {tag}key) for multi-key co-location",
        resourceName,
        keyPrefix,
      );
    }
  }

  // ── Key Prefixing ──────────────────────────────────────────────────────────

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  private prefixKeys(keys: string[]): string[] {
    return this.keyPrefix ? keys.map((k) => `${this.keyPrefix}${k}`) : keys;
  }

  private stripPrefix(key: string): string {
    return this.keyPrefix && key.startsWith(this.keyPrefix)
      ? key.slice(this.keyPrefix.length)
      : key;
  }

  // ── Core Key-Value ─────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.traced("celerity.cache.get", { "cache.key": key }, async () => {
      try {
        return await this.client.get(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to get key "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async set(key: string, value: string, options?: SetOptions): Promise<boolean> {
    return this.traced("celerity.cache.set", { "cache.key": key }, async () => {
      try {
        const suffix: string[] = [];
        if (options?.ttl !== undefined) suffix.push("EX", String(options.ttl));
        if (options?.ifNotExists) suffix.push("NX");
        else if (options?.ifExists) suffix.push("XX");

        const result = await this.client.set(
          this.prefixKey(key),
          value,
          ...(suffix as ["EX", string]),
        );
        return result === "OK";
      } catch (error) {
        throw new CacheError(`Failed to set key "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.traced("celerity.cache.delete", { "cache.key": key }, async () => {
      try {
        const count = await this.client.del(this.prefixKey(key));
        return count > 0;
      } catch (error) {
        throw new CacheError(`Failed to delete key "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async ttl(key: string): Promise<number> {
    return this.traced("celerity.cache.ttl", { "cache.key": key }, async () => {
      try {
        return await this.client.ttl(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to get TTL for key "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async getSet(key: string, value: string): Promise<string | null> {
    return this.traced("celerity.cache.get_set", { "cache.key": key }, async () => {
      try {
        return await this.client.getset(this.prefixKey(key), value);
      } catch (error) {
        throw new CacheError(`Failed to getSet key "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async append(key: string, value: string): Promise<number> {
    return this.traced("celerity.cache.append", { "cache.key": key }, async () => {
      try {
        return await this.client.append(this.prefixKey(key), value);
      } catch (error) {
        throw new CacheError(`Failed to append to key "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  // ── Batch Key-Value ────────────────────────────────────────────────────────

  async mget(keys: string[]): Promise<(string | null)[]> {
    return this.traced("celerity.cache.mget", { "cache.key_count": keys.length }, async () => {
      try {
        const prefixed = this.prefixKeys(keys);

        if (!this.clusterMode || keys.length <= 1) {
          return await this.client.mget(...prefixed);
        }

        // Cluster mode: fan-out by slot, reassemble in original order
        const groups = groupBySlot(prefixed);
        const results: (string | null)[] = new Array(keys.length).fill(null);

        for (const [, indices] of groups) {
          const slotKeys = indices.map((i) => prefixed[i]);
          const slotResults = await this.client.mget(...slotKeys);
          for (let j = 0; j < indices.length; j++) {
            results[indices[j]] = slotResults[j];
          }
        }

        return results;
      } catch (error) {
        throw new CacheError("Failed to mget", this.resourceName, { cause: error });
      }
    });
  }

  async mset(entries: [string, string][]): Promise<void> {
    return this.traced("celerity.cache.mset", { "cache.key_count": entries.length }, async () => {
      try {
        const prefixed: [string, string][] = entries.map(([k, v]) => [this.prefixKey(k), v]);

        if (!this.clusterMode || entries.length <= 1) {
          const flat = prefixed.flatMap(([k, v]) => [k, v]);
          await (this.client as Redis).mset(...(flat as [string, string, ...string[]]));
          return;
        }

        // Cluster mode: group by slot, mset per group
        const groups = groupBySlot(prefixed.map(([k]) => k));
        for (const [, indices] of groups) {
          const flat = indices.flatMap((i) => [prefixed[i][0], prefixed[i][1]]);
          await (this.client as Redis).mset(...(flat as [string, string, ...string[]]));
        }
      } catch (error) {
        throw new CacheError("Failed to mset", this.resourceName, { cause: error });
      }
    });
  }

  async mdelete(keys: string[]): Promise<number> {
    return this.traced("celerity.cache.mdelete", { "cache.key_count": keys.length }, async () => {
      try {
        const prefixed = this.prefixKeys(keys);

        if (!this.clusterMode || keys.length <= 1) {
          return await this.client.del(...prefixed);
        }

        // Cluster mode: group by slot, del per group
        const groups = groupBySlot(prefixed);
        let total = 0;
        for (const [, indices] of groups) {
          const slotKeys = indices.map((i) => prefixed[i]);
          total += await this.client.del(...slotKeys);
        }
        return total;
      } catch (error) {
        throw new CacheError("Failed to mdelete", this.resourceName, { cause: error });
      }
    });
  }

  // ── Key Management ─────────────────────────────────────────────────────────

  async exists(key: string): Promise<boolean> {
    return this.traced("celerity.cache.exists", { "cache.key": key }, async () => {
      try {
        const count = await this.client.exists(this.prefixKey(key));
        return count > 0;
      } catch (error) {
        throw new CacheError(`Failed to check existence of "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.traced("celerity.cache.expire", { "cache.key": key }, async () => {
      try {
        const result = await this.client.expire(this.prefixKey(key), seconds);
        return result === 1;
      } catch (error) {
        throw new CacheError(`Failed to set expiry on "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async persist(key: string): Promise<boolean> {
    return this.traced("celerity.cache.persist", { "cache.key": key }, async () => {
      try {
        const result = await this.client.persist(this.prefixKey(key));
        return result === 1;
      } catch (error) {
        throw new CacheError(`Failed to persist "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async type(key: string): Promise<string | null> {
    return this.traced("celerity.cache.type", { "cache.key": key }, async () => {
      try {
        const result = await this.client.type(this.prefixKey(key));
        return result === "none" ? null : result;
      } catch (error) {
        throw new CacheError(`Failed to get type of "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async rename(key: string, newKey: string): Promise<void> {
    return this.traced("celerity.cache.rename", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        const prefixedNew = this.prefixKey(newKey);

        if (this.clusterMode) {
          assertSameSlot([prefixedKey, prefixedNew], "rename", this.resourceName);
        }

        await this.client.rename(prefixedKey, prefixedNew);
      } catch (error) {
        if (error instanceof CacheError) throw error;
        throw new CacheError(`Failed to rename "${key}" to "${newKey}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async *scan(options?: ScanOptions): AsyncIterable<string> {
    debug("scan %s (match=%s)", this.resourceName, options?.match);

    const match = options?.match
      ? this.prefixKey(options.match)
      : this.keyPrefix
        ? `${this.keyPrefix}*`
        : undefined;

    try {
      if (this.clusterMode) {
        yield* this.clusterScan(match, options?.count, options?.type);
      } else {
        yield* this.singleScan(match, options?.count, options?.type);
      }
    } catch (error) {
      throw new CacheError("Failed to scan", this.resourceName, { cause: error });
    }
  }

  private async *singleScan(
    match: string | undefined,
    count: number | undefined,
    type: string | undefined,
  ): AsyncIterable<string> {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.scanOnce(
        this.client as Redis,
        cursor,
        match,
        count,
        type,
      );
      cursor = nextCursor;
      for (const key of keys) {
        yield this.stripPrefix(key);
      }
    } while (cursor !== "0");
  }

  private async *clusterScan(
    match: string | undefined,
    count: number | undefined,
    type: string | undefined,
  ): AsyncIterable<string> {
    const cluster = this.client as Cluster;
    const nodes = cluster.nodes("master");

    for (const node of nodes) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.scanOnce(node, cursor, match, count, type);
        cursor = nextCursor;
        for (const key of keys) {
          yield this.stripPrefix(key);
        }
      } while (cursor !== "0");
    }
  }

  private async scanOnce(
    client: Redis,
    cursor: string,
    match: string | undefined,
    count: number | undefined,
    type: string | undefined,
  ): Promise<[cursor: string, elements: string[]]> {
    if (match && count && type) {
      return client.scan(cursor, "MATCH", match, "COUNT", count, "TYPE", type);
    }
    if (match && type) {
      return client.scan(cursor, "MATCH", match, "TYPE", type);
    }
    if (count && type) {
      return client.scan(cursor, "COUNT", count, "TYPE", type);
    }
    if (match && count) {
      return client.scan(cursor, "MATCH", match, "COUNT", count);
    }
    if (type) {
      return client.scan(cursor, "TYPE", type);
    }
    if (match) {
      return client.scan(cursor, "MATCH", match);
    }
    if (count) {
      return client.scan(cursor, "COUNT", count);
    }
    return client.scan(cursor);
  }

  // ── Counters ───────────────────────────────────────────────────────────────

  async incr(key: string, amount?: number): Promise<number> {
    return this.traced("celerity.cache.incr", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        return amount !== undefined && amount !== 1
          ? await this.client.incrby(prefixedKey, amount)
          : await this.client.incr(prefixedKey);
      } catch (error) {
        throw new CacheError(`Failed to incr "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async decr(key: string, amount?: number): Promise<number> {
    return this.traced("celerity.cache.decr", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        return amount !== undefined && amount !== 1
          ? await this.client.decrby(prefixedKey, amount)
          : await this.client.decr(prefixedKey);
      } catch (error) {
        throw new CacheError(`Failed to decr "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async incrFloat(key: string, amount: number): Promise<number> {
    return this.traced("celerity.cache.incr_float", { "cache.key": key }, async () => {
      try {
        const result = await this.client.incrbyfloat(this.prefixKey(key), amount);
        return Number.parseFloat(result);
      } catch (error) {
        throw new CacheError(`Failed to incrFloat "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  // ── Hashes ─────────────────────────────────────────────────────────────────

  async hashGet(key: string, field: string): Promise<string | null> {
    return this.traced(
      "celerity.cache.hash_get",
      { "cache.key": key, "cache.field": field },
      async () => {
        try {
          return await this.client.hget(this.prefixKey(key), field);
        } catch (error) {
          throw new CacheError(`Failed to hashGet "${key}"`, this.resourceName, { cause: error });
        }
      },
    );
  }

  async hashSet(key: string, fields: Record<string, string>): Promise<void> {
    return this.traced("celerity.cache.hash_set", { "cache.key": key }, async () => {
      try {
        await this.client.hset(this.prefixKey(key), fields);
      } catch (error) {
        throw new CacheError(`Failed to hashSet "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async hashDelete(key: string, fields: string[]): Promise<number> {
    return this.traced("celerity.cache.hash_delete", { "cache.key": key }, async () => {
      try {
        return await this.client.hdel(this.prefixKey(key), ...fields);
      } catch (error) {
        throw new CacheError(`Failed to hashDelete "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async hashGetAll(key: string): Promise<Record<string, string>> {
    return this.traced("celerity.cache.hash_get_all", { "cache.key": key }, async () => {
      try {
        return await this.client.hgetall(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to hashGetAll "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async hashExists(key: string, field: string): Promise<boolean> {
    return this.traced(
      "celerity.cache.hash_exists",
      { "cache.key": key, "cache.field": field },
      async () => {
        try {
          const result = await this.client.hexists(this.prefixKey(key), field);
          return result === 1;
        } catch (error) {
          throw new CacheError(`Failed to hashExists "${key}"`, this.resourceName, {
            cause: error,
          });
        }
      },
    );
  }

  async hashIncr(key: string, field: string, amount?: number): Promise<number> {
    return this.traced(
      "celerity.cache.hash_incr",
      { "cache.key": key, "cache.field": field },
      async () => {
        try {
          return await this.client.hincrby(this.prefixKey(key), field, amount ?? 1);
        } catch (error) {
          throw new CacheError(`Failed to hashIncr "${key}"`, this.resourceName, { cause: error });
        }
      },
    );
  }

  async hashKeys(key: string): Promise<string[]> {
    return this.traced("celerity.cache.hash_keys", { "cache.key": key }, async () => {
      try {
        return await this.client.hkeys(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to hashKeys "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async hashLen(key: string): Promise<number> {
    return this.traced("celerity.cache.hash_len", { "cache.key": key }, async () => {
      try {
        return await this.client.hlen(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to hashLen "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  // ── Lists ──────────────────────────────────────────────────────────────────

  async listPush(key: string, values: string[], end?: "left" | "right"): Promise<number> {
    return this.traced("celerity.cache.list_push", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        return end === "left"
          ? await this.client.lpush(prefixedKey, ...values)
          : await this.client.rpush(prefixedKey, ...values);
      } catch (error) {
        throw new CacheError(`Failed to listPush "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async listPop(key: string, end?: "left" | "right", count?: number): Promise<string[]> {
    return this.traced("celerity.cache.list_pop", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        const n = count ?? 1;

        if (n === 1) {
          const result =
            end === "right"
              ? await this.client.rpop(prefixedKey)
              : await this.client.lpop(prefixedKey);
          return result !== null ? [result] : [];
        }

        const result =
          end === "right"
            ? await (this.client as Redis).rpop(prefixedKey, n)
            : await (this.client as Redis).lpop(prefixedKey, n);
        return (result as string[] | null) ?? [];
      } catch (error) {
        throw new CacheError(`Failed to listPop "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async listRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.traced("celerity.cache.list_range", { "cache.key": key }, async () => {
      try {
        return await this.client.lrange(this.prefixKey(key), start, stop);
      } catch (error) {
        throw new CacheError(`Failed to listRange "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async listLen(key: string): Promise<number> {
    return this.traced("celerity.cache.list_len", { "cache.key": key }, async () => {
      try {
        return await this.client.llen(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to listLen "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async listTrim(key: string, start: number, stop: number): Promise<void> {
    return this.traced("celerity.cache.list_trim", { "cache.key": key }, async () => {
      try {
        await this.client.ltrim(this.prefixKey(key), start, stop);
      } catch (error) {
        throw new CacheError(`Failed to listTrim "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async listIndex(key: string, index: number): Promise<string | null> {
    return this.traced("celerity.cache.list_index", { "cache.key": key }, async () => {
      try {
        return await this.client.lindex(this.prefixKey(key), index);
      } catch (error) {
        throw new CacheError(`Failed to listIndex "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  // ── Sets ───────────────────────────────────────────────────────────────────

  async setAdd(key: string, members: string[]): Promise<number> {
    return this.traced("celerity.cache.set_add", { "cache.key": key }, async () => {
      try {
        return await this.client.sadd(this.prefixKey(key), ...members);
      } catch (error) {
        throw new CacheError(`Failed to setAdd "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async setRemove(key: string, members: string[]): Promise<number> {
    return this.traced("celerity.cache.set_remove", { "cache.key": key }, async () => {
      try {
        return await this.client.srem(this.prefixKey(key), ...members);
      } catch (error) {
        throw new CacheError(`Failed to setRemove "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async setMembers(key: string): Promise<string[]> {
    return this.traced("celerity.cache.set_members", { "cache.key": key }, async () => {
      try {
        return await this.client.smembers(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to setMembers "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    return this.traced("celerity.cache.set_is_member", { "cache.key": key }, async () => {
      try {
        const result = await this.client.sismember(this.prefixKey(key), member);
        return result === 1;
      } catch (error) {
        throw new CacheError(`Failed to setIsMember "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async setLen(key: string): Promise<number> {
    return this.traced("celerity.cache.set_len", { "cache.key": key }, async () => {
      try {
        return await this.client.scard(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to setLen "${key}"`, this.resourceName, { cause: error });
      }
    });
  }

  async setUnion(keys: string[]): Promise<string[]> {
    return this.traced("celerity.cache.set_union", { "cache.key_count": keys.length }, async () => {
      try {
        const prefixed = this.prefixKeys(keys);
        if (this.clusterMode) {
          assertSameSlot(prefixed, "setUnion", this.resourceName);
        }
        return await this.client.sunion(...prefixed);
      } catch (error) {
        if (error instanceof CacheError) throw error;
        throw new CacheError("Failed to setUnion", this.resourceName, { cause: error });
      }
    });
  }

  async setIntersect(keys: string[]): Promise<string[]> {
    return this.traced(
      "celerity.cache.set_intersect",
      { "cache.key_count": keys.length },
      async () => {
        try {
          const prefixed = this.prefixKeys(keys);
          if (this.clusterMode) {
            assertSameSlot(prefixed, "setIntersect", this.resourceName);
          }
          return await this.client.sinter(...prefixed);
        } catch (error) {
          if (error instanceof CacheError) throw error;
          throw new CacheError("Failed to setIntersect", this.resourceName, { cause: error });
        }
      },
    );
  }

  async setDiff(keys: string[]): Promise<string[]> {
    return this.traced("celerity.cache.set_diff", { "cache.key_count": keys.length }, async () => {
      try {
        const prefixed = this.prefixKeys(keys);
        if (this.clusterMode) {
          assertSameSlot(prefixed, "setDiff", this.resourceName);
        }
        return await this.client.sdiff(...prefixed);
      } catch (error) {
        if (error instanceof CacheError) throw error;
        throw new CacheError("Failed to setDiff", this.resourceName, { cause: error });
      }
    });
  }

  // ── Sorted Sets ────────────────────────────────────────────────────────────

  async sortedSetAdd(key: string, members: SortedSetMember[]): Promise<number> {
    return this.traced("celerity.cache.sorted_set_add", { "cache.key": key }, async () => {
      try {
        const args: (string | number)[] = [];
        for (const { score, member } of members) {
          args.push(score, member);
        }
        return await this.client.zadd(this.prefixKey(key), ...(args as [string, ...string[]]));
      } catch (error) {
        throw new CacheError(`Failed to sortedSetAdd "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetRemove(key: string, members: string[]): Promise<number> {
    return this.traced("celerity.cache.sorted_set_remove", { "cache.key": key }, async () => {
      try {
        return await this.client.zrem(this.prefixKey(key), ...members);
      } catch (error) {
        throw new CacheError(`Failed to sortedSetRemove "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetScore(key: string, member: string): Promise<number | null> {
    return this.traced("celerity.cache.sorted_set_score", { "cache.key": key }, async () => {
      try {
        const result = await this.client.zscore(this.prefixKey(key), member);
        return result !== null ? Number.parseFloat(result) : null;
      } catch (error) {
        throw new CacheError(`Failed to sortedSetScore "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetRank(key: string, member: string, reverse?: boolean): Promise<number | null> {
    return this.traced("celerity.cache.sorted_set_rank", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        return reverse
          ? await this.client.zrevrank(prefixedKey, member)
          : await this.client.zrank(prefixedKey, member);
      } catch (error) {
        throw new CacheError(`Failed to sortedSetRank "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetRange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | SortedSetMember[]> {
    return this.traced("celerity.cache.sorted_set_range", { "cache.key": key }, async () => {
      try {
        const prefixedKey = this.prefixKey(key);
        const cmd = options?.reverse ? "zrevrange" : "zrange";

        if (options?.withScores) {
          const raw = await this.client[cmd](prefixedKey, start, stop, "WITHSCORES");
          return pairsToSortedSetMembers(raw);
        }

        return await this.client[cmd](prefixedKey, start, stop);
      } catch (error) {
        throw new CacheError(`Failed to sortedSetRange "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetRangeByScore(
    key: string,
    min: number | "-inf",
    max: number | "+inf",
    options?: SortedSetScoreRangeOptions,
  ): Promise<string[] | SortedSetMember[]> {
    return this.traced(
      "celerity.cache.sorted_set_range_by_score",
      { "cache.key": key },
      async () => {
        try {
          const prefixedKey = this.prefixKey(key);
          const minStr = String(min);
          const maxStr = String(max);
          const hasLimit = options?.offset !== undefined && options?.count !== undefined;

          const raw = options?.reverse
            ? await this.zScoreRange("zrevrangebyscore", prefixedKey, maxStr, minStr, {
                withScores: options?.withScores,
                hasLimit,
                offset: options?.offset,
                count: options?.count,
              })
            : await this.zScoreRange("zrangebyscore", prefixedKey, minStr, maxStr, {
                withScores: options?.withScores,
                hasLimit,
                offset: options?.offset,
                count: options?.count,
              });

          return options?.withScores ? pairsToSortedSetMembers(raw) : raw;
        } catch (error) {
          throw new CacheError(`Failed to sortedSetRangeByScore "${key}"`, this.resourceName, {
            cause: error,
          });
        }
      },
    );
  }

  private async zScoreRange(
    cmd: "zrangebyscore" | "zrevrangebyscore",
    key: string,
    low: string,
    high: string,
    opts: {
      withScores?: boolean;
      hasLimit?: boolean;
      offset?: number;
      count?: number;
    },
  ): Promise<string[]> {
    const client = this.client as Redis;
    if (opts.withScores && opts.hasLimit) {
      return client[cmd](key, low, high, "WITHSCORES", "LIMIT", opts.offset!, opts.count!);
    }
    if (opts.withScores) {
      return client[cmd](key, low, high, "WITHSCORES");
    }
    if (opts.hasLimit) {
      return client[cmd](key, low, high, "LIMIT", opts.offset!, opts.count!);
    }
    return client[cmd](key, low, high);
  }

  async sortedSetIncr(key: string, member: string, amount: number): Promise<number> {
    return this.traced("celerity.cache.sorted_set_incr", { "cache.key": key }, async () => {
      try {
        const result = await this.client.zincrby(this.prefixKey(key), amount, member);
        return Number.parseFloat(result);
      } catch (error) {
        throw new CacheError(`Failed to sortedSetIncr "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetLen(key: string): Promise<number> {
    return this.traced("celerity.cache.sorted_set_len", { "cache.key": key }, async () => {
      try {
        return await this.client.zcard(this.prefixKey(key));
      } catch (error) {
        throw new CacheError(`Failed to sortedSetLen "${key}"`, this.resourceName, {
          cause: error,
        });
      }
    });
  }

  async sortedSetCountByScore(
    key: string,
    min: number | "-inf",
    max: number | "+inf",
  ): Promise<number> {
    return this.traced(
      "celerity.cache.sorted_set_count_by_score",
      { "cache.key": key },
      async () => {
        try {
          return await this.client.zcount(this.prefixKey(key), String(min), String(max));
        } catch (error) {
          throw new CacheError(`Failed to sortedSetCountByScore "${key}"`, this.resourceName, {
            cause: error,
          });
        }
      },
    );
  }

  async sortedSetRemoveByRank(key: string, start: number, stop: number): Promise<number> {
    return this.traced(
      "celerity.cache.sorted_set_remove_by_rank",
      { "cache.key": key },
      async () => {
        try {
          return await this.client.zremrangebyrank(this.prefixKey(key), start, stop);
        } catch (error) {
          throw new CacheError(`Failed to sortedSetRemoveByRank "${key}"`, this.resourceName, {
            cause: error,
          });
        }
      },
    );
  }

  async sortedSetRemoveByScore(
    key: string,
    min: number | "-inf",
    max: number | "+inf",
  ): Promise<number> {
    return this.traced(
      "celerity.cache.sorted_set_remove_by_score",
      { "cache.key": key },
      async () => {
        try {
          return await this.client.zremrangebyscore(this.prefixKey(key), String(min), String(max));
        } catch (error) {
          throw new CacheError(`Failed to sortedSetRemoveByScore "${key}"`, this.resourceName, {
            cause: error,
          });
        }
      },
    );
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  async transaction(fn: (tx: CacheTransaction) => void): Promise<TransactionResult> {
    return this.traced("celerity.cache.transaction", {}, async () => {
      const builder = new RedisCacheTransactionBuilder(this.keyPrefix);
      fn(builder);

      const commands = builder.getCommands();
      if (commands.length === 0) {
        return { results: [] };
      }

      // Validate same hash slot in cluster mode
      if (this.clusterMode) {
        const allKeys = builder.getKeys();
        if (allKeys.length > 0) {
          assertSameSlot(allKeys, "transaction", this.resourceName);
        }
      }

      try {
        const pipeline = this.client.multi();
        for (const cmd of commands) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pipeline as any)[cmd.command](...cmd.args);
        }

        const rawResults = await pipeline.exec();
        if (!rawResults) {
          throw new CacheError("Transaction was discarded", this.resourceName);
        }

        const results: unknown[] = [];
        for (const [err, result] of rawResults) {
          if (err) {
            throw new CacheError("Transaction command failed", this.resourceName, { cause: err });
          }
          results.push(result);
        }

        return { results };
      } catch (error) {
        if (error instanceof CacheError) throw error;
        throw new CacheError("Failed to execute transaction", this.resourceName, { cause: error });
      }
    });
  }

  // ── Tracing Helper ─────────────────────────────────────────────────────────

  private traced<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span?: CeleritySpan) => Promise<T>,
  ): Promise<T> {
    if (!this.tracer) return fn();
    return this.tracer.withSpan(name, (span) => fn(span), {
      "cache.resource": this.resourceName,
      ...attributes,
    });
  }
}

// ── Transaction Builder ──────────────────────────────────────────────────────

type TransactionCommand = {
  command: string;
  args: (string | number)[];
};

class RedisCacheTransactionBuilder implements CacheTransaction {
  private readonly commands: TransactionCommand[] = [];
  private readonly keys: string[] = [];

  constructor(private readonly keyPrefix: string = "") {}

  getCommands(): TransactionCommand[] {
    return this.commands;
  }

  getKeys(): string[] {
    return this.keys;
  }

  private prefixedKey(key: string): string {
    const prefixed = this.keyPrefix ? `${this.keyPrefix}${key}` : key;
    this.keys.push(prefixed);
    return prefixed;
  }

  set(key: string, value: string, options?: SetOptions): this {
    const args: (string | number)[] = [this.prefixedKey(key), value];
    if (options?.ttl !== undefined) args.push("EX", options.ttl);
    if (options?.ifNotExists) args.push("NX");
    else if (options?.ifExists) args.push("XX");
    this.commands.push({ command: "set", args });
    return this;
  }

  delete(key: string): this {
    this.commands.push({ command: "del", args: [this.prefixedKey(key)] });
    return this;
  }

  getSet(key: string, value: string): this {
    this.commands.push({ command: "getset", args: [this.prefixedKey(key), value] });
    return this;
  }

  append(key: string, value: string): this {
    this.commands.push({ command: "append", args: [this.prefixedKey(key), value] });
    return this;
  }

  incr(key: string, amount?: number): this {
    if (amount !== undefined && amount !== 1) {
      this.commands.push({ command: "incrby", args: [this.prefixedKey(key), amount] });
    } else {
      this.commands.push({ command: "incr", args: [this.prefixedKey(key)] });
    }
    return this;
  }

  decr(key: string, amount?: number): this {
    if (amount !== undefined && amount !== 1) {
      this.commands.push({ command: "decrby", args: [this.prefixedKey(key), amount] });
    } else {
      this.commands.push({ command: "decr", args: [this.prefixedKey(key)] });
    }
    return this;
  }

  incrFloat(key: string, amount: number): this {
    this.commands.push({ command: "incrbyfloat", args: [this.prefixedKey(key), amount] });
    return this;
  }

  hashSet(key: string, fields: Record<string, string>): this {
    const args: (string | number)[] = [this.prefixedKey(key)];
    for (const [f, v] of Object.entries(fields)) {
      args.push(f, v);
    }
    this.commands.push({ command: "hset", args });
    return this;
  }

  hashDelete(key: string, fields: string[]): this {
    this.commands.push({ command: "hdel", args: [this.prefixedKey(key), ...fields] });
    return this;
  }

  hashIncr(key: string, field: string, amount?: number): this {
    this.commands.push({ command: "hincrby", args: [this.prefixedKey(key), field, amount ?? 1] });
    return this;
  }

  listPush(key: string, values: string[], end?: "left" | "right"): this {
    const command = end === "left" ? "lpush" : "rpush";
    this.commands.push({ command, args: [this.prefixedKey(key), ...values] });
    return this;
  }

  listTrim(key: string, start: number, stop: number): this {
    this.commands.push({ command: "ltrim", args: [this.prefixedKey(key), start, stop] });
    return this;
  }

  setAdd(key: string, members: string[]): this {
    this.commands.push({ command: "sadd", args: [this.prefixedKey(key), ...members] });
    return this;
  }

  setRemove(key: string, members: string[]): this {
    this.commands.push({ command: "srem", args: [this.prefixedKey(key), ...members] });
    return this;
  }

  sortedSetAdd(key: string, members: SortedSetMember[]): this {
    const args: (string | number)[] = [this.prefixedKey(key)];
    for (const { score, member } of members) {
      args.push(score, member);
    }
    this.commands.push({ command: "zadd", args });
    return this;
  }

  sortedSetRemove(key: string, members: string[]): this {
    this.commands.push({ command: "zrem", args: [this.prefixedKey(key), ...members] });
    return this;
  }

  sortedSetIncr(key: string, member: string, amount: number): this {
    this.commands.push({ command: "zincrby", args: [this.prefixedKey(key), amount, member] });
    return this;
  }

  expire(key: string, seconds: number): this {
    this.commands.push({ command: "expire", args: [this.prefixedKey(key), seconds] });
    return this;
  }

  persist(key: string): this {
    this.commands.push({ command: "persist", args: [this.prefixedKey(key)] });
    return this;
  }

  rename(key: string, newKey: string): this {
    this.commands.push({
      command: "rename",
      args: [this.prefixedKey(key), this.prefixedKey(newKey)],
    });
    return this;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pairsToSortedSetMembers(raw: string[]): SortedSetMember[] {
  const result: SortedSetMember[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({ member: raw[i], score: Number.parseFloat(raw[i + 1]) });
  }
  return result;
}
