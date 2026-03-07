import { describe, it, expect, afterAll } from "vitest";
import Redis from "ioredis";
import { RedisTopicClient } from "../../src/providers/redis/redis-topic-client";
import { TopicError } from "../../src/errors";

const REDIS_URL = "redis://localhost:6399";
const TEST_CHANNEL = "test-topic-channel";

const client = new RedisTopicClient({ url: REDIS_URL });

// Subscriber Redis client for verification
const subscriber = new Redis(REDIS_URL);

afterAll(async () => {
  await client.close();
  await subscriber.quit();
});

/**
 * Subscribes to a channel and collects messages until the expected count
 * is reached or the timeout expires.
 */
function collectMessages(
  channel: string,
  expectedCount: number,
  timeoutMs = 5000,
): Promise<string[]> {
  return new Promise((resolve) => {
    const messages: string[] = [];
    let timer: ReturnType<typeof setTimeout>;

    const handler = (ch: string, message: string) => {
      if (ch === channel) {
        messages.push(message);
        if (messages.length >= expectedCount) {
          clearTimeout(timer);
          subscriber.removeListener("message", handler);
          subscriber.unsubscribe(channel).then(() => resolve(messages));
        }
      }
    };

    subscriber.subscribe(channel).then(() => {
      subscriber.on("message", handler);

      timer = setTimeout(() => {
        subscriber.removeListener("message", handler);
        subscriber.unsubscribe(channel).then(() => resolve(messages));
      }, timeoutMs);
    });
  });
}

describe("Redis Provider (integration)", () => {
  describe("publish", () => {
    it("should publish a message and receive it on the channel", async () => {
      const collecting = collectMessages(TEST_CHANNEL, 1);

      // Small delay to ensure subscriber is ready
      await new Promise((r) => setTimeout(r, 100));

      const topic = client.topic(TEST_CHANNEL);
      const result = await topic.publish({ orderId: "order-1", total: 42 });

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe("string");

      const messages = await collecting;
      expect(messages).toHaveLength(1);

      const envelope = JSON.parse(messages[0]);
      expect(envelope.body).toBe('{"orderId":"order-1","total":42}');
    });

    it("should include subject and attributes in the envelope", async () => {
      const collecting = collectMessages(TEST_CHANNEL, 1);
      await new Promise((r) => setTimeout(r, 100));

      const topic = client.topic(TEST_CHANNEL);
      await topic.publish(
        { data: "with-meta" },
        { subject: "OrderCreated", attributes: { env: "test" } },
      );

      const messages = await collecting;
      const envelope = JSON.parse(messages[0]);
      expect(envelope.subject).toBe("OrderCreated");
      expect(envelope.attributes).toEqual({ env: "test" });
    });
  });

  describe("publishBatch", () => {
    it("should publish a batch of messages via pipeline", async () => {
      const batchChannel = "test-topic-batch";
      const collecting = collectMessages(batchChannel, 3);
      await new Promise((r) => setTimeout(r, 100));

      const topic = client.topic(batchChannel);
      const entries = Array.from({ length: 3 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await topic.publishBatch(entries);

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      for (const s of result.successful) {
        expect(s.messageId).toBeDefined();
      }

      const messages = await collecting;
      expect(messages).toHaveLength(3);

      // Verify message ordering
      for (let i = 0; i < 3; i++) {
        const envelope = JSON.parse(messages[i]);
        expect(JSON.parse(envelope.body)).toEqual({ index: i });
      }
    });
  });

  describe("error cases", () => {
    it("should wrap connection errors in TopicError", async () => {
      const badClient = new RedisTopicClient({ url: "redis://localhost:1" });
      const topic = badClient.topic("fail-channel");

      await expect(topic.publish({ data: "fail" })).rejects.toThrow(TopicError);
      try {
        await badClient.close();
      } catch {
        // Ignore close errors on bad client
      }
    });
  });
});
