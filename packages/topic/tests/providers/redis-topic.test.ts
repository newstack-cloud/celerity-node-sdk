import { describe, it, expect, vi, beforeEach } from "vitest";
import type Redis from "ioredis";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { RedisTopic } from "../../src/providers/redis/redis-topic";
import { TopicError } from "../../src/errors";

// --- Mocks ---

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  let counter = 0;
  return {
    ...actual,
    randomUUID: vi.fn(() => `uuid-${counter++}`),
  };
});

function mockRedis(): Redis {
  return {
    publish: vi.fn(),
    pipeline: vi.fn(),
  } as unknown as Redis;
}

function mockPipeline() {
  return {
    publish: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };
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

// --- Tests ---

describe("RedisTopic", () => {
  let redis: Redis;

  beforeEach(() => {
    redis = mockRedis();
    vi.clearAllMocks();
  });

  describe("publish", () => {
    it("publishes a JSON envelope with body and messageId to the channel", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publish({ orderId: "abc" });

      expect(result.messageId).toMatch(/^uuid-/);
      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.body).toBe('{"orderId":"abc"}');
      expect(envelope.messageId).toBe(result.messageId);
    });

    it("includes subject in the envelope when provided", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const topic = new RedisTopic("order-events", redis);

      await topic.publish({ data: "value" }, { subject: "OrderCreated" });

      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.subject).toBe("OrderCreated");
      expect(envelope.body).toBe('{"data":"value"}');
    });

    it("includes attributes in the envelope when provided", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const topic = new RedisTopic("order-events", redis);

      await topic.publish({ data: "value" }, { attributes: { env: "prod", priority: "high" } });

      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.attributes).toEqual({ env: "prod", priority: "high" });
    });

    it("does not include attributes in the envelope when empty", async () => {
      vi.mocked(redis.publish).mockResolvedValue(0);
      const topic = new RedisTopic("order-events", redis);

      await topic.publish({ data: "value" }, { attributes: {} });

      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.attributes).toBeUndefined();
    });

    it("does not include subject in the envelope when undefined", async () => {
      vi.mocked(redis.publish).mockResolvedValue(0);
      const topic = new RedisTopic("order-events", redis);

      await topic.publish({ data: "value" });

      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.subject).toBeUndefined();
    });

    it("silently ignores groupId and deduplicationId (not in envelope)", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const topic = new RedisTopic("order-events", redis);

      await topic.publish(
        { data: "value" },
        { groupId: "group-1", deduplicationId: "dedup-1", subject: "Test" },
      );

      const payload = vi.mocked(redis.publish).mock.calls[0][1];
      const envelope = JSON.parse(payload as string);
      expect(envelope.groupId).toBeUndefined();
      expect(envelope.deduplicationId).toBeUndefined();
      expect(envelope.subject).toBe("Test");
    });

    it("wraps Redis errors in TopicError with cause", async () => {
      const redisError = new Error("CLUSTERDOWN");
      vi.mocked(redis.publish).mockRejectedValue(redisError);
      const topic = new RedisTopic("order-events", redis);

      await expect(topic.publish({ data: "value" })).rejects.toThrow(TopicError);
      try {
        await topic.publish({ data: "value" });
      } catch (error) {
        expect(error).toBeInstanceOf(TopicError);
        expect((error as TopicError).topic).toBe("order-events");
        expect((error as TopicError).cause).toBe(redisError);
        expect((error as TopicError).message).toContain("order-events");
      }
    });
  });

  describe("publishBatch", () => {
    it("publishes a batch via pipeline", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
      ]);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publishBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toHaveLength(2);
      expect(result.successful[0].id).toBe("e1");
      expect(result.successful[1].id).toBe("e2");
      expect(result.failed).toEqual([]);
      expect(pipeline.publish).toHaveBeenCalledTimes(2);
    });

    it("publishes correct envelope for each batch entry", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([[null, 1]]);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publishBatch([
        {
          id: "e1",
          body: { data: "value" },
          options: { subject: "Test", attributes: { key: "val" } },
        },
      ]);

      const [channel, payload] = pipeline.publish.mock.calls[0];
      expect(channel).toBe("order-events");
      const envelope = JSON.parse(payload);
      expect(envelope.body).toBe('{"data":"value"}');
      expect(envelope.messageId).toBe(result.successful[0].messageId);
      expect(envelope.subject).toBe("Test");
      expect(envelope.attributes).toEqual({ key: "val" });
    });

    it("reports pipeline errors as failed entries", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const pipelineError = Object.assign(new Error("ERR wrong type"), { name: "ReplyError" });
      pipeline.exec.mockResolvedValue([
        [null, 1],
        [pipelineError, null],
      ]);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publishBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toHaveLength(1);
      expect(result.successful[0].id).toBe("e1");
      expect(result.failed).toEqual([
        { id: "e2", code: "ReplyError", message: "ERR wrong type" },
      ]);
    });

    it("wraps pipeline exec failure (null result) in TopicError", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue(null);
      const topic = new RedisTopic("order-events", redis);

      await expect(
        topic.publishBatch([{ id: "e1", body: { a: 1 } }]),
      ).rejects.toThrow(TopicError);
    });

    it("wraps pipeline exec rejection in TopicError", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const redisError = new Error("Connection lost");
      pipeline.exec.mockRejectedValue(redisError);
      const topic = new RedisTopic("order-events", redis);

      await expect(
        topic.publishBatch([{ id: "e1", body: { a: 1 } }]),
      ).rejects.toThrow(TopicError);
      try {
        await topic.publishBatch([{ id: "e1", body: { a: 1 } }]);
      } catch (error) {
        expect((error as TopicError).topic).toBe("order-events");
        expect((error as TopicError).cause).toBe(redisError);
      }
    });

    it("falls back to PipelineError when error has no name", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const pipelineError = new Error("something");
      Object.defineProperty(pipelineError, "name", { value: undefined });
      pipeline.exec.mockResolvedValue([[pipelineError, null]]);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publishBatch([{ id: "e1", body: { a: 1 } }]);

      expect(result.failed[0].code).toBe("PipelineError");
    });
  });

  describe("tracer spans", () => {
    it("calls withSpan for publish with correct name and attributes", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const tracer = mockTracer();
      const topic = new RedisTopic("order-events", redis, tracer);

      await topic.publish({ data: "value" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.topic.publish",
        expect.any(Function),
        { "topic.channel": "order-events" },
      );
    });

    it("calls withSpan for publishBatch with correct name and attributes", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([[null, 1]]);
      const tracer = mockTracer();
      const topic = new RedisTopic("order-events", redis, tracer);

      await topic.publishBatch([{ id: "e1", body: { a: 1 } }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.topic.publish_batch",
        expect.any(Function),
        { "topic.channel": "order-events", "topic.message_count": 1 },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      vi.mocked(redis.publish).mockResolvedValue(1);
      const topic = new RedisTopic("order-events", redis);

      const result = await topic.publish({ data: "value" });
      expect(result.messageId).toMatch(/^uuid-/);
    });
  });
});
