import { describe, it, expect, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { RedisQueueClient } from "../../src/providers/redis/redis-queue-client";
import { QueueError } from "../../src/errors";

const REDIS_URL = "redis://localhost:6399";
const TEST_STREAM = "test-stream";

const client = new RedisQueueClient({ url: REDIS_URL });

// Raw Redis client for verification reads
const rawRedis = new Redis(REDIS_URL);

afterAll(async () => {
  await client.close();
  await rawRedis.quit();
});

beforeEach(async () => {
  // Clean the stream before each test
  await rawRedis.del(TEST_STREAM);
});

describe("Redis Provider (integration)", () => {
  describe("sendMessage", () => {
    it("should send a message and verify it in the stream", async () => {
      const queue = client.queue(TEST_STREAM);
      const result = await queue.sendMessage({ orderId: "order-1", total: 42 });

      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^\d+-\d+$/);

      // Verify by reading the stream
      const entries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      expect(entries).toHaveLength(1);

      const [, fields] = entries[0];
      const fieldMap = toMap(fields);
      expect(JSON.parse(fieldMap.body)).toEqual({ orderId: "order-1", total: 42 });
      expect(fieldMap.message_type).toBe("0");
      expect(fieldMap.timestamp).toBeDefined();
    });

    it("should include the correct stream format fields (body, timestamp, message_type)", async () => {
      const queue = client.queue(TEST_STREAM);
      await queue.sendMessage({ data: "value" });

      const entries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      const [, fields] = entries[0];
      const fieldMap = toMap(fields);

      expect(fieldMap).toHaveProperty("body");
      expect(fieldMap).toHaveProperty("timestamp");
      expect(fieldMap).toHaveProperty("message_type");
      expect(fieldMap.message_type).toBe("0");

      const timestamp = parseInt(fieldMap.timestamp, 10);
      expect(timestamp).toBeGreaterThan(0);
      // Timestamp should be Unix seconds (roughly current time)
      expect(timestamp).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
    });

    it("should store group_id and dedup_id fields when provided", async () => {
      const queue = client.queue(TEST_STREAM);
      await queue.sendMessage(
        { data: "value" },
        { groupId: "group-1", deduplicationId: "dedup-1" },
      );

      const entries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      const [, fields] = entries[0];
      const fieldMap = toMap(fields);

      expect(fieldMap.group_id).toBe("group-1");
      expect(fieldMap.dedup_id).toBe("dedup-1");
    });

    it("should store attributes as a JSON field when provided", async () => {
      const queue = client.queue(TEST_STREAM);
      await queue.sendMessage(
        { data: "value" },
        { attributes: { env: "prod", priority: "high" } },
      );

      const entries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      const [, fields] = entries[0];
      const fieldMap = toMap(fields);

      expect(JSON.parse(fieldMap.attributes)).toEqual({ env: "prod", priority: "high" });
    });
  });

  describe("sendMessageBatch", () => {
    it("should send a batch of messages via pipeline", async () => {
      const queue = client.queue(TEST_STREAM);
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await queue.sendMessageBatch(entries);

      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
      for (const s of result.successful) {
        expect(s.messageId).toMatch(/^\d+-\d+$/);
      }

      // Verify all messages are in the stream
      const streamEntries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      expect(streamEntries).toHaveLength(5);

      // Verify message bodies
      for (let i = 0; i < 5; i++) {
        const [, fields] = streamEntries[i];
        const fieldMap = toMap(fields);
        expect(JSON.parse(fieldMap.body)).toEqual({ index: i });
      }
    });

    it("should preserve per-message options in batch", async () => {
      const queue = client.queue(TEST_STREAM);
      await queue.sendMessageBatch([
        {
          id: "e1",
          body: { data: "value" },
          options: { groupId: "group-1", attributes: { key: "val" } },
        },
      ]);

      const entries = await rawRedis.xrange(TEST_STREAM, "-", "+");
      const [, fields] = entries[0];
      const fieldMap = toMap(fields);

      expect(fieldMap.group_id).toBe("group-1");
      expect(JSON.parse(fieldMap.attributes)).toEqual({ key: "val" });
    });
  });

  describe("error cases", () => {
    it("should wrap connection errors in QueueError", async () => {
      // Use a client pointing to a non-existent Redis
      const badClient = new RedisQueueClient({ url: "redis://localhost:1" });
      const queue = badClient.queue("fail-stream");

      await expect(queue.sendMessage({ data: "fail" })).rejects.toThrow(QueueError);
      try {
        await badClient.close();
      } catch {
        // Ignore close errors on bad client
      }
    });
  });
});

/**
 * Converts a flat array of alternating key-value pairs from XRANGE
 * into a Record for easier assertions.
 */
function toMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }
  return map;
}
