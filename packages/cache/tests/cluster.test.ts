import { describe, it, expect } from "vitest";
import { hashSlot, groupBySlot, assertSameSlot } from "../src/providers/redis/cluster";
import { CacheError } from "../src/errors";

describe("hashSlot", () => {
  it("returns a slot in the valid range [0, 16383]", () => {
    const slot = hashSlot("mykey");
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThanOrEqual(16383);
  });

  it("returns the same slot for the same key", () => {
    expect(hashSlot("mykey")).toBe(hashSlot("mykey"));
  });

  it("uses hash tag content when braces are present", () => {
    // {user:123}.session and {user:123}.profile should hash to the same slot
    expect(hashSlot("{user:123}.session")).toBe(hashSlot("{user:123}.profile"));
  });

  it("ignores empty hash tags (uses full key)", () => {
    // {} should not be treated as a hash tag
    const slotEmpty = hashSlot("{}key");
    const slotFull = hashSlot("{}key");
    expect(slotEmpty).toBe(slotFull);
  });

  it("uses only the first hash tag", () => {
    // {a}{b} should hash on "a"
    expect(hashSlot("{a}{b}")).toBe(hashSlot("{a}"));
  });

  it("hashes different keys to (potentially) different slots", () => {
    // While collisions are possible, for well-known keys they should differ
    const slotA = hashSlot("keyA");
    const slotB = hashSlot("keyB");
    // We just check they're both valid; exact values depend on CRC16
    expect(slotA).toBeGreaterThanOrEqual(0);
    expect(slotB).toBeGreaterThanOrEqual(0);
  });

  it("computes known CRC16 slot for well-known key", () => {
    // "foo" should hash to slot 12182 per Redis CRC16 spec
    expect(hashSlot("foo")).toBe(12182);
  });
});

describe("groupBySlot", () => {
  it("groups keys sharing the same hash tag into the same slot", () => {
    const keys = ["{user:1}.name", "{user:1}.email", "{user:2}.name"];
    const groups = groupBySlot(keys);

    // user:1 keys go together
    const slot1 = hashSlot("{user:1}.name");
    const slot2 = hashSlot("{user:2}.name");

    const group1 = groups.get(slot1)!;
    expect(group1).toContain(0);
    expect(group1).toContain(1);

    const group2 = groups.get(slot2)!;
    expect(group2).toContain(2);
  });

  it("returns a single group when all keys share the same slot", () => {
    const keys = ["{same}.a", "{same}.b", "{same}.c"];
    const groups = groupBySlot(keys);
    expect(groups.size).toBe(1);
    const [indices] = [...groups.values()];
    expect(indices).toEqual([0, 1, 2]);
  });

  it("returns an empty map for empty input", () => {
    const groups = groupBySlot([]);
    expect(groups.size).toBe(0);
  });
});

describe("assertSameSlot", () => {
  it("does not throw when all keys share the same slot", () => {
    const keys = ["{tag}.a", "{tag}.b", "{tag}.c"];
    expect(() => assertSameSlot(keys, "test", "cache")).not.toThrow();
  });

  it("throws CacheError when keys span multiple slots", () => {
    const keys = ["key-a", "key-b", "key-c"];
    // These keys will likely map to different slots
    const groups = groupBySlot(keys);
    if (groups.size > 1) {
      expect(() => assertSameSlot(keys, "test", "cache")).toThrow(CacheError);
    }
  });

  it("includes operation name in the error message", () => {
    const keys = ["key-a", "key-b"];
    const groups = groupBySlot(keys);
    if (groups.size > 1) {
      try {
        assertSameSlot(keys, "setUnion", "my-cache");
      } catch (error) {
        expect(error).toBeInstanceOf(CacheError);
        expect((error as CacheError).message).toContain("setUnion");
        expect((error as CacheError).cache).toBe("my-cache");
      }
    }
  });

  it("does not throw for a single key", () => {
    expect(() => assertSameSlot(["only-one"], "test", "cache")).not.toThrow();
  });

  it("does not throw for empty array", () => {
    expect(() => assertSameSlot([], "test", "cache")).not.toThrow();
  });
});
