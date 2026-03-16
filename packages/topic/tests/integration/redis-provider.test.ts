import { describe, it, expect, afterAll, beforeAll } from "vitest";
import Redis from "ioredis";
import { RedisTopicClient } from "../../src/providers/redis/redis-topic-client";
import { TopicError } from "../../src/errors";

const REDIS_URL = "redis://localhost:6399";
const TEST_TOPIC = "test-topic-channel";
const TEST_CHANNEL = `celerity:topic:channel:${TEST_TOPIC}`;

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
 *
 * Returns `{ subscribed, messages }`:
 *  - `subscribed` resolves once the SUBSCRIBE command has been acknowledged.
 *     **Await this before publishing** to eliminate the sub/pub race.
 *  - `messages` resolves with the collected messages array.
 */
function collectMessages(
  channel: string,
  expectedCount: number,
  timeoutMs = 5000,
): { subscribed: Promise<void>; messages: Promise<string[]> } {
  let resolveSubscribed!: () => void;
  const subscribed = new Promise<void>((r) => {
    resolveSubscribed = r;
  });

  const messages = new Promise<string[]>((resolve) => {
    const collected: string[] = [];
    let timer: ReturnType<typeof setTimeout>;

    const handler = (ch: string, message: string) => {
      if (ch === channel) {
        collected.push(message);
        if (collected.length >= expectedCount) {
          clearTimeout(timer);
          subscriber.removeListener("message", handler);
          subscriber.unsubscribe(channel).then(() => resolve(collected));
        }
      }
    };

    subscriber.on("message", handler);

    subscriber.subscribe(channel).then(() => {
      resolveSubscribed();
      timer = setTimeout(() => {
        subscriber.removeListener("message", handler);
        subscriber.unsubscribe(channel).then(() => resolve(collected));
      }, timeoutMs);
    });
  });

  return { subscribed, messages };
}

describe("Redis Provider (integration)", () => {
  beforeAll(async () => {
    await client.ensureIoRedis();
  });

  describe("publish", () => {
    it("should publish a message and receive it on the channel", async () => {
      const { subscribed, messages: collecting } = collectMessages(TEST_CHANNEL, 1);
      await subscribed;

      const topic = client.topic(TEST_TOPIC);
      const result = await topic.publish({ orderId: "order-1", total: 42 });

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe("string");

      const messages = await collecting;
      expect(messages).toHaveLength(1);

      const envelope = JSON.parse(messages[0]);
      expect(envelope.body).toBe('{"orderId":"order-1","total":42}');
    });

    it("should include subject and attributes in the envelope", async () => {
      const { subscribed, messages: collecting } = collectMessages(TEST_CHANNEL, 1);
      await subscribed;

      const topic = client.topic(TEST_TOPIC);
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
      const batchTopic = "test-topic-batch";
      const batchChannel = `celerity:topic:channel:${batchTopic}`;
      const { subscribed, messages: collecting } = collectMessages(batchChannel, 3);
      await subscribed;

      const topic = client.topic(batchTopic);
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
      await badClient.ensureIoRedis();
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
