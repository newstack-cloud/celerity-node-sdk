import { describe, it, expect, vi, beforeEach } from "vitest";
import type Redis from "ioredis";
import type { Cluster } from "ioredis";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { RedisCache } from "../../src/providers/redis/redis-cache";
import { CacheError } from "../../src/errors";

// --- Mocks ---

function mockRedis(): Redis {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
    getset: vi.fn(),
    append: vi.fn(),
    mget: vi.fn(),
    mset: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    persist: vi.fn(),
    type: vi.fn(),
    rename: vi.fn(),
    scan: vi.fn(),
    incr: vi.fn(),
    incrby: vi.fn(),
    decr: vi.fn(),
    decrby: vi.fn(),
    incrbyfloat: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
    hdel: vi.fn(),
    hgetall: vi.fn(),
    hexists: vi.fn(),
    hincrby: vi.fn(),
    hkeys: vi.fn(),
    hlen: vi.fn(),
    lpush: vi.fn(),
    rpush: vi.fn(),
    lpop: vi.fn(),
    rpop: vi.fn(),
    lrange: vi.fn(),
    llen: vi.fn(),
    ltrim: vi.fn(),
    lindex: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    sismember: vi.fn(),
    scard: vi.fn(),
    sunion: vi.fn(),
    sinter: vi.fn(),
    sdiff: vi.fn(),
    zadd: vi.fn(),
    zrem: vi.fn(),
    zscore: vi.fn(),
    zrank: vi.fn(),
    zrevrank: vi.fn(),
    zrange: vi.fn(),
    zrevrange: vi.fn(),
    zrangebyscore: vi.fn(),
    zrevrangebyscore: vi.fn(),
    zincrby: vi.fn(),
    zcard: vi.fn(),
    zcount: vi.fn(),
    zremrangebyrank: vi.fn(),
    zremrangebyscore: vi.fn(),
    multi: vi.fn(),
  } as unknown as Redis;
}

function mockCluster(redis: Redis): Cluster {
  return Object.assign(redis, {
    nodes: vi.fn(() => [redis]),
  }) as unknown as Cluster;
}

function mockSpan(): CeleritySpan {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    recordError: vi.fn(),
    setOk: vi.fn(),
    end: vi.fn(),
  };
}

function mockTracer(): CelerityTracer & { withSpan: ReturnType<typeof vi.fn> } {
  const span = mockSpan();
  return {
    startSpan: vi.fn(() => span),
    withSpan: vi.fn(async (_name, fn, _attrs) => fn(span)),
  };
}

async function drain(iter: AsyncIterable<unknown>): Promise<void> {
  const reader = iter[Symbol.asyncIterator]();
  while (!(await reader.next()).done) {
    /* exhaust */
  }
}

// --- Tests ---

describe("RedisCache", () => {
  let redis: Redis;

  beforeEach(() => {
    redis = mockRedis();
  });

  // ── Key Prefix Validation ──

  describe("key prefix validation", () => {
    it("throws when key prefix contains '{'", () => {
      expect(() => new RedisCache("test", redis, false, undefined, "{ns}:")).toThrow(CacheError);
      expect(() => new RedisCache("test", redis, false, undefined, "{ns}:")).toThrow(
        "must not contain",
      );
    });

    it("throws when key prefix contains '}'", () => {
      expect(() => new RedisCache("test", redis, false, undefined, "ns}:")).toThrow(CacheError);
    });

    it("allows a prefix without braces", () => {
      expect(() => new RedisCache("test", redis, false, undefined, "app:")).not.toThrow();
    });

    it("allows an empty prefix", () => {
      expect(() => new RedisCache("test", redis, false)).not.toThrow();
    });
  });

  // ── Key Prefixing ──

  describe("key prefixing", () => {
    it("prefixes the key on get", async () => {
      vi.mocked(redis.get).mockResolvedValue("value");
      const cache = new RedisCache("test", redis, false, undefined, "app:");

      await cache.get("mykey");

      expect(redis.get).toHaveBeenCalledWith("app:mykey");
    });

    it("prefixes the key on set", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");
      const cache = new RedisCache("test", redis, false, undefined, "ns:");

      await cache.set("key", "value");

      expect(redis.set).toHaveBeenCalledWith("ns:key", "value");
    });

    it("prefixes all keys on mget", async () => {
      vi.mocked(redis.mget).mockResolvedValue(["val"]);
      const cache = new RedisCache("test", redis, false, undefined, "ns:");

      await cache.mget(["k1"]);
      expect(redis.mget).toHaveBeenCalledWith("ns:k1");
    });

    it("strips prefix from scan results", async () => {
      vi.mocked(redis.scan).mockResolvedValueOnce(["0", ["ns:a", "ns:b"]]);
      const cache = new RedisCache("test", redis, false, undefined, "ns:");

      const keys: string[] = [];
      for await (const key of cache.scan()) {
        keys.push(key);
      }
      expect(keys).toEqual(["a", "b"]);
    });
  });

  // ── Set Option Combinations ──

  describe("set options", () => {
    it("passes EX when ttl is provided", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");
      const cache = new RedisCache("test", redis, false);

      await cache.set("key", "value", { ttl: 60 });

      expect(redis.set).toHaveBeenCalledWith("key", "value", "EX", "60");
    });

    it("passes NX when ifNotExists is true", async () => {
      vi.mocked(redis.set).mockResolvedValue(null);
      const cache = new RedisCache("test", redis, false);

      const result = await cache.set("key", "value", { ifNotExists: true });

      expect(result).toBe(false);
      expect(redis.set).toHaveBeenCalledWith("key", "value", "NX");
    });

    it("passes XX when ifExists is true", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");
      const cache = new RedisCache("test", redis, false);

      await cache.set("key", "value", { ifExists: true });

      expect(redis.set).toHaveBeenCalledWith("key", "value", "XX");
    });

    it("passes EX and NX combined", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");
      const cache = new RedisCache("test", redis, false);

      await cache.set("key", "value", { ttl: 60, ifNotExists: true });

      expect(redis.set).toHaveBeenCalledWith("key", "value", "EX", "60", "NX");
    });

    it("passes EX and XX combined", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");
      const cache = new RedisCache("test", redis, false);

      await cache.set("key", "value", { ttl: 60, ifExists: true });

      expect(redis.set).toHaveBeenCalledWith("key", "value", "EX", "60", "XX");
    });
  });

  // ── Branch-Specific Behavior ──

  describe("branch-specific behavior", () => {
    it("type returns null when Redis returns 'none'", async () => {
      vi.mocked(redis.type).mockResolvedValue("none");
      const cache = new RedisCache("test", redis, false);
      expect(await cache.type("key")).toBeNull();
    });

    it("incr uses incr for amount=1", async () => {
      vi.mocked(redis.incr).mockResolvedValue(1);
      const cache = new RedisCache("test", redis, false);
      await cache.incr("counter");
      expect(redis.incr).toHaveBeenCalledWith("counter");
    });

    it("incr uses incrby for custom amount", async () => {
      vi.mocked(redis.incrby).mockResolvedValue(5);
      const cache = new RedisCache("test", redis, false);
      await cache.incr("counter", 5);
      expect(redis.incrby).toHaveBeenCalledWith("counter", 5);
    });

    it("decr uses decr for amount=1", async () => {
      vi.mocked(redis.decr).mockResolvedValue(-1);
      const cache = new RedisCache("test", redis, false);
      await cache.decr("counter");
      expect(redis.decr).toHaveBeenCalledWith("counter");
    });

    it("decr uses decrby for custom amount", async () => {
      vi.mocked(redis.decrby).mockResolvedValue(-5);
      const cache = new RedisCache("test", redis, false);
      await cache.decr("counter", 5);
      expect(redis.decrby).toHaveBeenCalledWith("counter", 5);
    });

    it("listPush uses lpush for left", async () => {
      vi.mocked(redis.lpush).mockResolvedValue(1);
      const cache = new RedisCache("test", redis, false);
      await cache.listPush("list", ["a"], "left");
      expect(redis.lpush).toHaveBeenCalledWith("list", "a");
    });

    it("listPush uses rpush by default", async () => {
      vi.mocked(redis.rpush).mockResolvedValue(1);
      const cache = new RedisCache("test", redis, false);
      await cache.listPush("list", ["a"]);
      expect(redis.rpush).toHaveBeenCalledWith("list", "a");
    });

    it("listPop single item wraps result in array", async () => {
      vi.mocked(redis.lpop as ReturnType<typeof vi.fn>).mockResolvedValue("item");
      const cache = new RedisCache("test", redis, false);
      expect(await cache.listPop("list")).toEqual(["item"]);
    });

    it("listPop returns empty array when list is empty", async () => {
      vi.mocked(redis.lpop as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const cache = new RedisCache("test", redis, false);
      expect(await cache.listPop("list")).toEqual([]);
    });

    it("listPop uses count overload for count > 1", async () => {
      vi.mocked(redis.lpop as ReturnType<typeof vi.fn>).mockResolvedValue(["a", "b"]);
      const cache = new RedisCache("test", redis, false);
      expect(await cache.listPop("list", "left", 2)).toEqual(["a", "b"]);
    });

    it("listPop pops from the right when specified", async () => {
      vi.mocked(redis.rpop as ReturnType<typeof vi.fn>).mockResolvedValue("item");
      const cache = new RedisCache("test", redis, false);
      await cache.listPop("list", "right");
      expect(redis.rpop).toHaveBeenCalledWith("list");
    });

    it("sortedSetRank uses zrevrank when reverse is true", async () => {
      vi.mocked(redis.zrevrank).mockResolvedValue(2);
      const cache = new RedisCache("test", redis, false);
      await cache.sortedSetRank("zset", "a", true);
      expect(redis.zrevrank).toHaveBeenCalledWith("zset", "a");
    });

    it("sortedSetRange uses zrevrange when reverse is true", async () => {
      vi.mocked(redis.zrevrange).mockResolvedValue(["b", "a"]);
      const cache = new RedisCache("test", redis, false);
      await cache.sortedSetRange("zset", 0, 1, { reverse: true });
      expect(redis.zrevrange).toHaveBeenCalledWith("zset", 0, 1);
    });

    it("sortedSetRange passes WITHSCORES and parses pairs", async () => {
      vi.mocked(redis.zrange).mockResolvedValue(["a", "1", "b", "2"]);
      const cache = new RedisCache("test", redis, false);
      const result = await cache.sortedSetRange("zset", 0, 1, { withScores: true });
      expect(result).toEqual([
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
    });

    it("sortedSetRangeByScore passes LIMIT", async () => {
      vi.mocked(redis.zrangebyscore).mockResolvedValue(["b"]);
      const cache = new RedisCache("test", redis, false);
      await cache.sortedSetRangeByScore("zset", 0, 100, { offset: 1, count: 1 });
      expect(redis.zrangebyscore).toHaveBeenCalledWith("zset", "0", "100", "LIMIT", 1, 1);
    });

    it("sortedSetRangeByScore passes WITHSCORES and LIMIT combined", async () => {
      vi.mocked(redis.zrangebyscore).mockResolvedValue(["a", "10"]);
      const cache = new RedisCache("test", redis, false);
      await cache.sortedSetRangeByScore("zset", 0, 100, {
        withScores: true,
        offset: 0,
        count: 1,
      });
      expect(redis.zrangebyscore).toHaveBeenCalledWith(
        "zset",
        "0",
        "100",
        "WITHSCORES",
        "LIMIT",
        0,
        1,
      );
    });

    it("sortedSetRangeByScore uses zrevrangebyscore when reverse is true", async () => {
      vi.mocked(redis.zrevrangebyscore).mockResolvedValue(["b", "a"]);
      const cache = new RedisCache("test", redis, false);
      await cache.sortedSetRangeByScore("zset", 0, 100, { reverse: true });
      expect(redis.zrevrangebyscore).toHaveBeenCalledWith("zset", "100", "0");
    });
  });

  // ── Scan Option Combinations ──

  describe("scan option combinations", () => {
    it("passes MATCH when match is provided", async () => {
      vi.mocked(redis.scan).mockResolvedValueOnce(["0", ["k1"]]);
      const cache = new RedisCache("test", redis, false);

      const keys: string[] = [];
      for await (const key of cache.scan({ match: "user:*" })) keys.push(key);

      expect(redis.scan).toHaveBeenCalledWith("0", "MATCH", "user:*");
    });

    it("passes COUNT when count is provided", async () => {
      vi.mocked(redis.scan).mockResolvedValueOnce(["0", []]);
      const cache = new RedisCache("test", redis, false);

      await drain(cache.scan({ count: 100 }));

      expect(redis.scan).toHaveBeenCalledWith("0", "COUNT", 100);
    });

    it("passes TYPE when type is provided", async () => {
      vi.mocked(redis.scan).mockResolvedValueOnce(["0", []]);
      const cache = new RedisCache("test", redis, false);

      await drain(cache.scan({ type: "string" }));

      expect(redis.scan).toHaveBeenCalledWith("0", "TYPE", "string");
    });

    it("passes MATCH, COUNT, and TYPE together", async () => {
      vi.mocked(redis.scan).mockResolvedValueOnce(["0", []]);
      const cache = new RedisCache("test", redis, false);

      await drain(cache.scan({ match: "k:*", count: 50, type: "hash" }));

      expect(redis.scan).toHaveBeenCalledWith("0", "MATCH", "k:*", "COUNT", 50, "TYPE", "hash");
    });

    it("iterates multiple pages via cursor", async () => {
      vi.mocked(redis.scan)
        .mockResolvedValueOnce(["42", ["k1"]])
        .mockResolvedValueOnce(["0", ["k2"]]);
      const cache = new RedisCache("test", redis, false);

      const keys: string[] = [];
      for await (const key of cache.scan()) keys.push(key);

      expect(keys).toEqual(["k1", "k2"]);
      expect(redis.scan).toHaveBeenCalledTimes(2);
    });
  });

  // ── CacheError Wrapping ──

  describe("error wrapping", () => {
    it("wraps Redis errors in CacheError with cause and cache name", async () => {
      const redisError = new Error("CLUSTERDOWN");
      vi.mocked(redis.get).mockRejectedValue(redisError);
      const cache = new RedisCache("test", redis, false);

      await expect(cache.get("mykey")).rejects.toThrow(CacheError);
      try {
        await cache.get("mykey");
      } catch (error) {
        expect(error).toBeInstanceOf(CacheError);
        expect((error as CacheError).cache).toBe("test");
        expect((error as CacheError).cause).toBe(redisError);
      }
    });

    it("re-throws CacheError from assertSameSlot without wrapping", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      // rename with keys in different slots throws CacheError from assertSameSlot
      await expect(cache.rename("key-a", "key-z")).rejects.toThrow(CacheError);
      await expect(cache.rename("key-a", "key-z")).rejects.toThrow(
        "rename requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });
  });

  // ── Cluster Mode ──

  describe("cluster mode", () => {
    it("mget fans out by slot and reassembles in order", async () => {
      // Use keys that hash to different slots
      vi.mocked(redis.mget)
        .mockResolvedValueOnce(["v1"])
        .mockResolvedValueOnce(["v2"]);
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      // {a} and {b} hash to different slots, forcing fan-out
      const result = await cache.mget(["{a}k1", "{b}k2"]);

      expect(result).toHaveLength(2);
      expect(redis.mget).toHaveBeenCalledTimes(2);
    });

    it("mget uses single call when only one key", async () => {
      vi.mocked(redis.mget).mockResolvedValue(["val"]);
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await cache.mget(["single"]);

      expect(redis.mget).toHaveBeenCalledTimes(1);
    });

    it("mset fans out by slot", async () => {
      vi.mocked(redis.mset as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await cache.mset([
        ["{a}k1", "v1"],
        ["{b}k2", "v2"],
      ]);

      expect(redis.mset).toHaveBeenCalledTimes(2);
    });

    it("mdelete fans out by slot and sums counts", async () => {
      vi.mocked(redis.del).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      const count = await cache.mdelete(["{a}k1", "{b}k2"]);

      expect(count).toBe(2);
      expect(redis.del).toHaveBeenCalledTimes(2);
    });

    it("rename validates same slot", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await expect(cache.rename("key-a", "key-z")).rejects.toThrow(
        "rename requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });

    it("rename succeeds with same hash tag", async () => {
      vi.mocked(redis.rename).mockResolvedValue("OK");
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await cache.rename("{tag}old", "{tag}new");

      expect(redis.rename).toHaveBeenCalledWith("{tag}old", "{tag}new");
    });

    it("setUnion validates same slot", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await expect(cache.setUnion(["{a}s1", "{b}s2"])).rejects.toThrow(
        "setUnion requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });

    it("setIntersect validates same slot", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await expect(cache.setIntersect(["{a}s1", "{b}s2"])).rejects.toThrow(
        "setIntersect requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });

    it("setDiff validates same slot", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await expect(cache.setDiff(["{a}s1", "{b}s2"])).rejects.toThrow(
        "setDiff requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });

    it("transaction validates same slot for all keys", async () => {
      const cluster = mockCluster(redis);
      const cache = new RedisCache("test", cluster, true);

      await expect(
        cache.transaction((tx) => {
          tx.set("{a}key1", "v1");
          tx.set("{b}key2", "v2");
        }),
      ).rejects.toThrow(
        "transaction requires all keys to share a hash slot in cluster mode. " +
          "Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.",
      );
    });

    it("scan iterates all master nodes", async () => {
      const node1 = mockRedis();
      const node2 = mockRedis();
      vi.mocked(node1.scan).mockResolvedValueOnce(["0", ["k1"]]);
      vi.mocked(node2.scan).mockResolvedValueOnce(["0", ["k2"]]);

      const cluster = {
        ...redis,
        nodes: vi.fn(() => [node1, node2]),
      } as unknown as Cluster;
      const cache = new RedisCache("test", cluster, true);

      const keys: string[] = [];
      for await (const key of cache.scan()) keys.push(key);

      expect(keys).toEqual(["k1", "k2"]);
      expect(node1.scan).toHaveBeenCalledTimes(1);
      expect(node2.scan).toHaveBeenCalledTimes(1);
    });
  });

  // ── Transactions ──

  describe("transactions", () => {
    it("returns empty results for an empty transaction", async () => {
      const cache = new RedisCache("test", redis, false);
      const result = await cache.transaction(() => {});
      expect(result.results).toEqual([]);
    });

    it("throws CacheError when transaction is discarded", async () => {
      const pipeline = {
        set: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(redis.multi).mockReturnValue(pipeline as never);
      const cache = new RedisCache("test", redis, false);

      await expect(
        cache.transaction((tx) => tx.set("key", "value")),
      ).rejects.toThrow(CacheError);
    });

    it("throws CacheError when a command fails in the transaction", async () => {
      const pipeline = {
        set: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[new Error("WRONGTYPE"), null]]),
      };
      vi.mocked(redis.multi).mockReturnValue(pipeline as never);
      const cache = new RedisCache("test", redis, false);

      await expect(
        cache.transaction((tx) => tx.set("key", "value")),
      ).rejects.toThrow(CacheError);
    });
  });

  // ── Tracer Spans ──

  describe("tracer spans", () => {
    it("calls withSpan with correct name and attributes", async () => {
      vi.mocked(redis.get).mockResolvedValue("value");
      const tracer = mockTracer();
      const cache = new RedisCache("test", redis, false, tracer);

      await cache.get("mykey");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.cache.get",
        expect.any(Function),
        { "cache.resource": "test", "cache.key": "mykey" },
      );
    });

    it("includes key_count for batch operations", async () => {
      vi.mocked(redis.mget).mockResolvedValue(["a", "b"]);
      const tracer = mockTracer();
      const cache = new RedisCache("test", redis, false, tracer);

      await cache.mget(["k1", "k2"]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.cache.mget",
        expect.any(Function),
        { "cache.resource": "test", "cache.key_count": 2 },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      vi.mocked(redis.get).mockResolvedValue("value");
      const cache = new RedisCache("test", redis, false);

      const result = await cache.get("mykey");
      expect(result).toBe("value");
    });
  });
});
