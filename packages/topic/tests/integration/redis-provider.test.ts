import { describe, it, expect, afterAll, beforeAll } from "vitest";
import Redis from "ioredis";
import { RedisTopicClient } from "../../src/providers/redis/redis-topic-client";
import { TopicError } from "../../src/errors";

// Explicit IPv4 loopback to avoid per-connection DNS variance.
const REDIS_URL = "redis://127.0.0.1:6399";
const TEST_TOPIC = "test-topic-channel";
const TEST_CHANNEL = `celerity:topic:channel:${TEST_TOPIC}`;

// Internal payloads (matched by prefix) used to exercise the path; filtered out
// of collected messages.
const SENTINEL_PREFIX = "__celerity_sentinel__";
const READY_SENTINEL = `${SENTINEL_PREFIX}ready`;
const PROBE_SENTINEL = `${SENTINEL_PREFIX}probe`;

const client = new RedisTopicClient({ url: REDIS_URL });
const subscriber = new Redis(REDIS_URL);
const sentinelPublisher = new Redis(REDIS_URL);

afterAll(async () => {
  await client.close();
  await subscriber.quit();
  await sentinelPublisher.quit();
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Resolve once the connection's init sequence is done. Subscribing before "ready"
// lets SUBSCRIBE race ioredis's init commands, which the server then rejects with
// "Connection in subscriber mode", dropping the connection and its subscription.
const whenReady = (conn: Redis): Promise<void> =>
  conn.status === "ready"
    ? Promise.resolve()
    : new Promise<void>((resolve) => conn.once("ready", () => resolve()));

function describeSocket(conn: Redis): string {
  const stream = (conn as unknown as { stream?: import("node:net").Socket }).stream;
  if (!stream) return "no-stream";
  return `${stream.remoteAddress ?? "?"}:${stream.remotePort ?? "?"}(${stream.remoteFamily ?? "?"})`;
}

// `ready` resolves once a sentinel has round-tripped (proving the subscription is
// live, await before publishing). `messages` resolves with collected messages,
// or rejects with diagnostics on timeout. The collect deadline starts only after
// readiness, so a slow handshake can't eat the collection budget.
function subscribeAndCollect(
  channel: string,
  expectedCount: number,
  readyTimeoutMs = 6_000,
  collectTimeoutMs = 7_000,
): { ready: Promise<void>; messages: Promise<string[]> } {
  const collected: string[] = [];
  let sentinelSeen = false;
  let settled = false;
  let collectTimer: ReturnType<typeof setTimeout> | undefined;

  let resolveReady!: () => void;
  let rejectReady!: (err: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let resolveMessages!: (messages: string[]) => void;
  let rejectMessages!: (err: Error) => void;
  const messages = new Promise<string[]>((resolve, reject) => {
    resolveMessages = resolve;
    rejectMessages = reject;
  });

  const cleanup = () => {
    settled = true;
    if (collectTimer) clearTimeout(collectTimer);
    if (readyTimer) clearTimeout(readyTimer);
    subscriber.removeListener("message", handler);
    void subscriber.unsubscribe(channel);
  };

  const handler = (ch: string, message: string) => {
    if (ch !== channel) return;

    if (message.startsWith(SENTINEL_PREFIX)) {
      if (!sentinelSeen) {
        sentinelSeen = true;
        if (readyTimer) clearTimeout(readyTimer);
        resolveReady();
      }
      return;
    }

    collected.push(message);
    if (collected.length >= expectedCount) {
      cleanup();
      resolveMessages(collected);
    }
  };

  subscriber.on("message", handler);

  const readyTimer = setTimeout(() => {
    if (settled) return;
    cleanup();
    const err = new Error(
      `Readiness handshake failed after ${readyTimeoutMs}ms on "${channel}": ` +
        `subscriber status=${subscriber.status}, sentinelSeen=${sentinelSeen}`,
    );
    rejectReady(err);
    rejectMessages(err);
  }, readyTimeoutMs);

  const startCollectionDeadline = () => {
    if (settled) return;
    collectTimer = setTimeout(async () => {
      if (settled) return;
      // Probe via the known-good publisher: is the subscriber still live?
      let probeArrived = false;
      const probeHandler = (ch: string, msg: string) => {
        if (ch === channel && msg === PROBE_SENTINEL) probeArrived = true;
      };
      subscriber.on("message", probeHandler);
      let probeReceiverCount: number | string = -1;
      try {
        probeReceiverCount = await sentinelPublisher.publish(channel, PROBE_SENTINEL);
      } catch (e) {
        probeReceiverCount = `error: ${(e as Error).message}`;
      }
      await sleep(500);
      subscriber.removeListener("message", probeHandler);

      let activeChannels: string | string[] = "unknown";
      try {
        activeChannels = (await sentinelPublisher.call("PUBSUB", "CHANNELS")) as string[];
      } catch (e) {
        activeChannels = `error: ${(e as Error).message}`;
      }

      cleanup();
      const err = new Error(
        `Timed out after ${collectTimeoutMs}ms collecting on "${channel}": ` +
          `collected ${collected.length}/${expectedCount}, ` +
          `subscriber status=${subscriber.status}, sentinelSeen=${sentinelSeen}, ` +
          `probeArrived=${probeArrived}, probeReceiverCount=${probeReceiverCount}, ` +
          `subscriberSocket=${describeSocket(subscriber)}, ` +
          `publisherSocket=${describeSocket(sentinelPublisher)}, ` +
          `serverChannels=${JSON.stringify(activeChannels)}`,
      );
      rejectReady(err);
      rejectMessages(err);
    }, collectTimeoutMs);
  };

  // Subscribe, then publish sentinels until one round-trips, then start collecting.
  void subscriber.subscribe(channel).then(async () => {
    while (!sentinelSeen && !settled) {
      await sentinelPublisher.publish(channel, READY_SENTINEL);
      await sleep(50);
    }
    startCollectionDeadline();
  });

  return { ready, messages };
}

describe("Redis Provider (integration)", () => {
  beforeAll(async () => {
    // Connections must be ready before any SUBSCRIBE (see whenReady).
    await Promise.all([whenReady(subscriber), whenReady(sentinelPublisher)]);
    await client.ensureIoRedis();
  });

  describe("publish", () => {
    it("should publish a message and receive it on the channel", async () => {
      const { ready, messages: collecting } = subscribeAndCollect(TEST_CHANNEL, 1);
      await ready;

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
      const { ready, messages: collecting } = subscribeAndCollect(TEST_CHANNEL, 1);
      await ready;

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
      const { ready, messages: collecting } = subscribeAndCollect(batchChannel, 3);
      await ready;

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
