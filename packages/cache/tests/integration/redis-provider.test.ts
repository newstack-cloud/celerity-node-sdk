import { describe, it, expect, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { RedisCacheClient } from "../../src/providers/redis/redis-cache-client";

const REDIS_URL = "redis://localhost:6399";
const RESOURCE_NAME = "test-cache";
const KEY_PREFIX = "test:";

const client = new RedisCacheClient({
  host: "localhost",
  port: 6399,
  tls: false,
  clusterMode: false,
  authMode: "password",
  connectionConfig: {
    connectTimeoutMs: 5000,
    commandTimeoutMs: 5000,
    keepAliveMs: 0,
    maxRetries: 2,
    retryDelayMs: 100,
    lazyConnect: true,
  },
});
const cache = client.cache(RESOURCE_NAME, KEY_PREFIX);

// Raw Redis client for verification reads
const rawRedis = new Redis(REDIS_URL);

afterAll(async () => {
  await client.close();
  await rawRedis.quit();
});

beforeEach(async () => {
  // Clean all keys with our test prefix
  const keys = await rawRedis.keys(`${KEY_PREFIX}*`);
  if (keys.length > 0) {
    await rawRedis.del(...keys);
  }
});

describe("Redis Provider (integration)", () => {
  // ── Core Key-Value ──

  describe("get / set", () => {
    it("sets and gets a string value", async () => {
      await cache.set("greeting", "hello");
      const result = await cache.get("greeting");
      expect(result).toBe("hello");
    });

    it("returns null for a missing key", async () => {
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("sets with TTL", async () => {
      await cache.set("ephemeral", "value", { ttl: 60 });
      const ttl = await cache.ttl("ephemeral");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it("respects ifNotExists option", async () => {
      await cache.set("existing", "first");
      const result = await cache.set("existing", "second", { ifNotExists: true });
      expect(result).toBe(false);
      expect(await cache.get("existing")).toBe("first");
    });

    it("respects ifExists option", async () => {
      const result = await cache.set("nonexistent", "value", { ifExists: true });
      expect(result).toBe(false);
      expect(await cache.get("nonexistent")).toBeNull();
    });

    it("stores keys with the configured prefix", async () => {
      await cache.set("prefixed-key", "value");
      const raw = await rawRedis.get(`${KEY_PREFIX}prefixed-key`);
      expect(raw).toBe("value");
    });
  });

  describe("delete", () => {
    it("deletes an existing key", async () => {
      await cache.set("to-delete", "value");
      const result = await cache.delete("to-delete");
      expect(result).toBe(true);
      expect(await cache.get("to-delete")).toBeNull();
    });

    it("returns false when deleting a nonexistent key", async () => {
      const result = await cache.delete("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("getSet", () => {
    it("returns old value and sets new one", async () => {
      await cache.set("swap", "old");
      const result = await cache.getSet("swap", "new");
      expect(result).toBe("old");
      expect(await cache.get("swap")).toBe("new");
    });
  });

  describe("append", () => {
    it("appends to a string value", async () => {
      await cache.set("concat", "hello");
      const len = await cache.append("concat", " world");
      expect(len).toBe(11);
      expect(await cache.get("concat")).toBe("hello world");
    });
  });

  // ── Batch Operations ──

  describe("mget / mset / mdelete", () => {
    it("mset and mget multiple keys", async () => {
      await cache.mset([
        ["k1", "v1"],
        ["k2", "v2"],
        ["k3", "v3"],
      ]);
      const result = await cache.mget(["k1", "k2", "k3"]);
      expect(result).toEqual(["v1", "v2", "v3"]);
    });

    it("mget returns null for missing keys", async () => {
      await cache.set("present", "val");
      const result = await cache.mget(["present", "absent"]);
      expect(result).toEqual(["val", null]);
    });

    it("mdelete removes multiple keys", async () => {
      await cache.mset([
        ["d1", "v1"],
        ["d2", "v2"],
      ]);
      const count = await cache.mdelete(["d1", "d2", "nonexistent"]);
      expect(count).toBe(2);
    });
  });

  // ── Key Management ──

  describe("key management", () => {
    it("exists returns true for existing key", async () => {
      await cache.set("alive", "yes");
      expect(await cache.exists("alive")).toBe(true);
    });

    it("exists returns false for missing key", async () => {
      expect(await cache.exists("ghost")).toBe(false);
    });

    it("expire sets TTL on a key", async () => {
      await cache.set("expiry", "value");
      const result = await cache.expire("expiry", 30);
      expect(result).toBe(true);
      expect(await cache.ttl("expiry")).toBeGreaterThan(0);
    });

    it("persist removes TTL from a key", async () => {
      await cache.set("expiry", "value", { ttl: 60 });
      await cache.persist("expiry");
      expect(await cache.ttl("expiry")).toBe(-1);
    });

    it("type returns the correct type", async () => {
      await cache.set("str", "value");
      expect(await cache.type("str")).toBe("string");
    });

    it("type returns null for missing key", async () => {
      expect(await cache.type("ghost")).toBeNull();
    });

    it("rename renames a key", async () => {
      await cache.set("old-name", "value");
      await cache.rename("old-name", "new-name");
      expect(await cache.get("old-name")).toBeNull();
      expect(await cache.get("new-name")).toBe("value");
    });
  });

  // ── Scan ──

  describe("scan", () => {
    it("iterates all keys with prefix", async () => {
      await cache.mset([
        ["scan-a", "1"],
        ["scan-b", "2"],
        ["scan-c", "3"],
      ]);

      const keys: string[] = [];
      for await (const key of cache.scan()) {
        keys.push(key);
      }
      expect(keys.sort()).toEqual(["scan-a", "scan-b", "scan-c"]);
    });

    it("supports match pattern", async () => {
      await cache.mset([
        ["user:1", "alice"],
        ["user:2", "bob"],
        ["session:1", "data"],
      ]);

      const keys: string[] = [];
      for await (const key of cache.scan({ match: "user:*" })) {
        keys.push(key);
      }
      expect(keys.sort()).toEqual(["user:1", "user:2"]);
    });
  });

  // ── Counters ──

  describe("counters", () => {
    it("incr increments by 1", async () => {
      expect(await cache.incr("counter")).toBe(1);
      expect(await cache.incr("counter")).toBe(2);
    });

    it("incr increments by custom amount", async () => {
      expect(await cache.incr("counter", 5)).toBe(5);
    });

    it("decr decrements by 1", async () => {
      await cache.set("counter", "10");
      expect(await cache.decr("counter")).toBe(9);
    });

    it("incrFloat increments by float", async () => {
      await cache.set("fcount", "1.5");
      const result = await cache.incrFloat("fcount", 0.7);
      expect(result).toBeCloseTo(2.2);
    });
  });

  // ── Hashes ──

  describe("hashes", () => {
    it("sets and gets hash fields", async () => {
      await cache.hashSet("user:1", { name: "Alice", email: "alice@example.com" });
      expect(await cache.hashGet("user:1", "name")).toBe("Alice");
      expect(await cache.hashGet("user:1", "email")).toBe("alice@example.com");
    });

    it("hashGetAll returns all fields", async () => {
      await cache.hashSet("user:2", { name: "Bob", age: "30" });
      const all = await cache.hashGetAll("user:2");
      expect(all).toEqual({ name: "Bob", age: "30" });
    });

    it("hashDelete removes fields", async () => {
      await cache.hashSet("user:3", { name: "Charlie", temp: "yes" });
      expect(await cache.hashDelete("user:3", ["temp"])).toBe(1);
      expect(await cache.hashGet("user:3", "temp")).toBeNull();
    });

    it("hashExists checks field existence", async () => {
      await cache.hashSet("user:4", { name: "Dana" });
      expect(await cache.hashExists("user:4", "name")).toBe(true);
      expect(await cache.hashExists("user:4", "age")).toBe(false);
    });

    it("hashIncr increments a field value", async () => {
      await cache.hashSet("stats", { views: "10" });
      expect(await cache.hashIncr("stats", "views", 5)).toBe(15);
    });

    it("hashKeys returns field names", async () => {
      await cache.hashSet("fields", { a: "1", b: "2" });
      expect((await cache.hashKeys("fields")).sort()).toEqual(["a", "b"]);
    });

    it("hashLen returns field count", async () => {
      await cache.hashSet("hlen-test", { x: "1", y: "2", z: "3" });
      expect(await cache.hashLen("hlen-test")).toBe(3);
    });
  });

  // ── Lists ──

  describe("lists", () => {
    it("pushes and pops from a list", async () => {
      await cache.listPush("queue", ["a", "b", "c"]);
      expect(await cache.listLen("queue")).toBe(3);

      const popped = await cache.listPop("queue");
      expect(popped).toEqual(["a"]);
    });

    it("pushes to the left", async () => {
      await cache.listPush("stack", ["first"]);
      await cache.listPush("stack", ["second"], "left");
      expect(await cache.listRange("stack", 0, -1)).toEqual(["second", "first"]);
    });

    it("pops from the right", async () => {
      await cache.listPush("lr", ["a", "b", "c"]);
      const popped = await cache.listPop("lr", "right");
      expect(popped).toEqual(["c"]);
    });

    it("listRange returns a slice", async () => {
      await cache.listPush("range-test", ["a", "b", "c", "d"]);
      expect(await cache.listRange("range-test", 1, 2)).toEqual(["b", "c"]);
    });

    it("listTrim trims the list", async () => {
      await cache.listPush("trim-test", ["a", "b", "c", "d", "e"]);
      await cache.listTrim("trim-test", 0, 2);
      expect(await cache.listRange("trim-test", 0, -1)).toEqual(["a", "b", "c"]);
    });

    it("listIndex returns element at index", async () => {
      await cache.listPush("idx-test", ["a", "b", "c"]);
      expect(await cache.listIndex("idx-test", 1)).toBe("b");
    });
  });

  // ── Sets ──

  describe("sets", () => {
    it("adds and retrieves members", async () => {
      await cache.setAdd("colors", ["red", "blue", "green"]);
      const members = await cache.setMembers("colors");
      expect(members.sort()).toEqual(["blue", "green", "red"]);
    });

    it("removes members", async () => {
      await cache.setAdd("colors", ["red", "blue"]);
      expect(await cache.setRemove("colors", ["red"])).toBe(1);
      expect(await cache.setMembers("colors")).toEqual(["blue"]);
    });

    it("checks membership", async () => {
      await cache.setAdd("members", ["alice"]);
      expect(await cache.setIsMember("members", "alice")).toBe(true);
      expect(await cache.setIsMember("members", "bob")).toBe(false);
    });

    it("returns set cardinality", async () => {
      await cache.setAdd("card", ["a", "b", "c"]);
      expect(await cache.setLen("card")).toBe(3);
    });

    it("computes set union", async () => {
      await cache.setAdd("s1", ["a", "b"]);
      await cache.setAdd("s2", ["b", "c"]);
      const union = await cache.setUnion(["s1", "s2"]);
      expect(union.sort()).toEqual(["a", "b", "c"]);
    });

    it("computes set intersection", async () => {
      await cache.setAdd("si1", ["a", "b", "c"]);
      await cache.setAdd("si2", ["b", "c", "d"]);
      const inter = await cache.setIntersect(["si1", "si2"]);
      expect(inter.sort()).toEqual(["b", "c"]);
    });

    it("computes set difference", async () => {
      await cache.setAdd("sd1", ["a", "b", "c"]);
      await cache.setAdd("sd2", ["b", "c"]);
      const diff = await cache.setDiff(["sd1", "sd2"]);
      expect(diff).toEqual(["a"]);
    });
  });

  // ── Sorted Sets ──

  describe("sorted sets", () => {
    it("adds and retrieves members by rank", async () => {
      await cache.sortedSetAdd("leaderboard", [
        { score: 100, member: "alice" },
        { score: 200, member: "bob" },
        { score: 150, member: "charlie" },
      ]);
      const result = await cache.sortedSetRange("leaderboard", 0, -1);
      expect(result).toEqual(["alice", "charlie", "bob"]);
    });

    it("retrieves with scores", async () => {
      await cache.sortedSetAdd("scored", [
        { score: 1.5, member: "a" },
        { score: 2.5, member: "b" },
      ]);
      const result = await cache.sortedSetRange("scored", 0, -1, { withScores: true });
      expect(result).toEqual([
        { member: "a", score: 1.5 },
        { member: "b", score: 2.5 },
      ]);
    });

    it("retrieves in reverse order", async () => {
      await cache.sortedSetAdd("rev", [
        { score: 1, member: "a" },
        { score: 2, member: "b" },
      ]);
      const result = await cache.sortedSetRange("rev", 0, -1, { reverse: true });
      expect(result).toEqual(["b", "a"]);
    });

    it("queries by score range", async () => {
      await cache.sortedSetAdd("scores", [
        { score: 10, member: "low" },
        { score: 50, member: "mid" },
        { score: 90, member: "high" },
      ]);
      const result = await cache.sortedSetRangeByScore("scores", 20, 80);
      expect(result).toEqual(["mid"]);
    });

    it("gets the score of a member", async () => {
      await cache.sortedSetAdd("sc", [{ score: 42, member: "answer" }]);
      expect(await cache.sortedSetScore("sc", "answer")).toBe(42);
    });

    it("gets the rank of a member", async () => {
      await cache.sortedSetAdd("rank", [
        { score: 1, member: "a" },
        { score: 2, member: "b" },
        { score: 3, member: "c" },
      ]);
      expect(await cache.sortedSetRank("rank", "b")).toBe(1);
      expect(await cache.sortedSetRank("rank", "c", true)).toBe(0);
    });

    it("removes members", async () => {
      await cache.sortedSetAdd("rem", [
        { score: 1, member: "a" },
        { score: 2, member: "b" },
      ]);
      expect(await cache.sortedSetRemove("rem", ["a"])).toBe(1);
      expect(await cache.sortedSetLen("rem")).toBe(1);
    });

    it("increments a member score", async () => {
      await cache.sortedSetAdd("inc", [{ score: 10, member: "player" }]);
      expect(await cache.sortedSetIncr("inc", "player", 5)).toBe(15);
    });

    it("counts members in score range", async () => {
      await cache.sortedSetAdd("cnt", [
        { score: 1, member: "a" },
        { score: 5, member: "b" },
        { score: 10, member: "c" },
      ]);
      expect(await cache.sortedSetCountByScore("cnt", 2, 8)).toBe(1);
    });

    it("removes by rank", async () => {
      await cache.sortedSetAdd("rbr", [
        { score: 1, member: "a" },
        { score: 2, member: "b" },
        { score: 3, member: "c" },
      ]);
      expect(await cache.sortedSetRemoveByRank("rbr", 0, 0)).toBe(1);
      expect(await cache.sortedSetLen("rbr")).toBe(2);
    });

    it("removes by score", async () => {
      await cache.sortedSetAdd("rbs", [
        { score: 1, member: "a" },
        { score: 5, member: "b" },
        { score: 10, member: "c" },
      ]);
      expect(await cache.sortedSetRemoveByScore("rbs", "-inf", 5)).toBe(2);
      expect(await cache.sortedSetLen("rbs")).toBe(1);
    });
  });

  // ── Transactions ──

  describe("transactions", () => {
    it("executes a multi-command transaction", async () => {
      const result = await cache.transaction((tx) => {
        tx.set("tx-key", "tx-value");
        tx.incr("tx-counter");
        tx.incr("tx-counter");
      });

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toBe("OK");
      expect(result.results[1]).toBe(1);
      expect(result.results[2]).toBe(2);

      // Verify the side effects
      expect(await cache.get("tx-key")).toBe("tx-value");
      expect(await cache.get("tx-counter")).toBe("2");
    });

    it("returns empty results for an empty transaction", async () => {
      const result = await cache.transaction(() => {});
      expect(result.results).toEqual([]);
    });

    it("supports hash operations in transactions", async () => {
      const result = await cache.transaction((tx) => {
        tx.hashSet("tx-hash", { name: "Alice", role: "admin" });
        tx.hashDelete("tx-hash", ["role"]);
      });

      expect(result.results).toHaveLength(2);
      expect(await cache.hashGet("tx-hash", "name")).toBe("Alice");
      expect(await cache.hashGet("tx-hash", "role")).toBeNull();
    });

    it("supports list and set operations", async () => {
      const result = await cache.transaction((tx) => {
        tx.listPush("tx-list", ["a", "b"]);
        tx.setAdd("tx-set", ["x", "y"]);
      });

      expect(result.results).toHaveLength(2);
      expect(await cache.listLen("tx-list")).toBe(2);
      expect(await cache.setLen("tx-set")).toBe(2);
    });
  });

  // ── Error Cases ──

  describe("error cases", () => {
    it("wraps connection errors in CacheError", async () => {
      const { CacheError } = await import("../../src/errors");
      const badClient = new RedisCacheClient({
        host: "localhost",
        port: 1,
        tls: false,
        clusterMode: false,
        authMode: "password",
        connectionConfig: {
          connectTimeoutMs: 1000,
          commandTimeoutMs: 1000,
          keepAliveMs: 0,
          maxRetries: 0,
          retryDelayMs: 100,
          lazyConnect: true,
        },
      });
      const badCache = badClient.cache("bad");

      await expect(badCache.get("key")).rejects.toThrow(CacheError);
      try {
        await badClient.close();
      } catch {
        // Ignore close errors on bad client
      }
    });
  });
});
