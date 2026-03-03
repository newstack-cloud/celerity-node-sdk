import { describe, it, expect, vi, beforeEach } from "vitest";
import type Redis from "ioredis";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { RedisQueue } from "../../src/providers/redis/redis-queue";
import { QueueError } from "../../src/errors";

// --- Mocks ---

function mockRedis(): Redis {
  return {
    xadd: vi.fn(),
    pipeline: vi.fn(),
  } as unknown as Redis;
}

function mockPipeline() {
  return {
    xadd: vi.fn().mockReturnThis(),
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

describe("RedisQueue", () => {
  let redis: Redis;

  beforeEach(() => {
    redis = mockRedis();
  });

  describe("sendMessage", () => {
    it("sends a message via XADD with correct stream format", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("1234567890-0");
      const queue = new RedisQueue("orders-stream", redis);

      const result = await queue.sendMessage({ orderId: "abc" });

      expect(result.messageId).toBe("1234567890-0");
      expect(redis.xadd).toHaveBeenCalledWith(
        "orders-stream",
        "*",
        "body",
        '{"orderId":"abc"}',
        "timestamp",
        expect.any(String),
        "message_type",
        "0",
      );
    });

    it("includes group_id when groupId option is set", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("1234567890-0");
      const queue = new RedisQueue("orders-stream", redis);

      await queue.sendMessage({ data: "value" }, { groupId: "group-1" });

      const args = vi.mocked(redis.xadd).mock.calls[0];
      expect(args).toContain("group_id");
      expect(args).toContain("group-1");
    });

    it("includes dedup_id when deduplicationId option is set", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("1234567890-0");
      const queue = new RedisQueue("orders-stream", redis);

      await queue.sendMessage({ data: "value" }, { deduplicationId: "dedup-1" });

      const args = vi.mocked(redis.xadd).mock.calls[0];
      expect(args).toContain("dedup_id");
      expect(args).toContain("dedup-1");
    });

    it("includes JSON-encoded attributes when attributes option is set", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("1234567890-0");
      const queue = new RedisQueue("orders-stream", redis);

      await queue.sendMessage({ data: "value" }, { attributes: { env: "prod" } });

      const args = vi.mocked(redis.xadd).mock.calls[0];
      expect(args).toContain("attributes");
      expect(args).toContain('{"env":"prod"}');
    });

    it("does not include attributes field when attributes is empty", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("1234567890-0");
      const queue = new RedisQueue("orders-stream", redis);

      await queue.sendMessage({ data: "value" }, { attributes: {} });

      const args = vi.mocked(redis.xadd).mock.calls[0];
      expect(args).not.toContain("attributes");
    });

    it("wraps Redis errors in QueueError with cause", async () => {
      const redisError = new Error("CLUSTERDOWN");
      vi.mocked(redis.xadd).mockRejectedValue(redisError);
      const queue = new RedisQueue("orders-stream", redis);

      await expect(queue.sendMessage({ data: "value" })).rejects.toThrow(QueueError);
      try {
        await queue.sendMessage({ data: "value" });
      } catch (error) {
        expect(error).toBeInstanceOf(QueueError);
        expect((error as QueueError).queue).toBe("orders-stream");
        expect((error as QueueError).cause).toBe(redisError);
        expect((error as QueueError).message).toContain("orders-stream");
      }
    });
  });

  describe("sendMessageBatch", () => {
    it("sends a batch of messages via pipeline", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([
        [null, "100-0"],
        [null, "100-1"],
      ]);
      const queue = new RedisQueue("orders-stream", redis);

      const result = await queue.sendMessageBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toEqual([
        { id: "e1", messageId: "100-0" },
        { id: "e2", messageId: "100-1" },
      ]);
      expect(result.failed).toEqual([]);
      expect(pipeline.xadd).toHaveBeenCalledTimes(2);
    });

    it("reports pipeline errors as failed entries", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const pipelineError = Object.assign(new Error("ERR wrong type"), { name: "ReplyError" });
      pipeline.exec.mockResolvedValue([
        [null, "100-0"],
        [pipelineError, null],
      ]);
      const queue = new RedisQueue("orders-stream", redis);

      const result = await queue.sendMessageBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toEqual([{ id: "e1", messageId: "100-0" }]);
      expect(result.failed).toEqual([
        { id: "e2", code: "ReplyError", message: "ERR wrong type" },
      ]);
    });

    it("wraps pipeline exec failure in QueueError", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue(null);
      const queue = new RedisQueue("orders-stream", redis);

      await expect(
        queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]),
      ).rejects.toThrow(QueueError);
    });

    it("wraps pipeline exec rejection in QueueError", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const redisError = new Error("Connection lost");
      pipeline.exec.mockRejectedValue(redisError);
      const queue = new RedisQueue("orders-stream", redis);

      await expect(
        queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]),
      ).rejects.toThrow(QueueError);
      try {
        await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);
      } catch (error) {
        expect((error as QueueError).queue).toBe("orders-stream");
        expect((error as QueueError).cause).toBe(redisError);
      }
    });

    it("passes per-message options to XADD fields", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([[null, "100-0"]]);
      const queue = new RedisQueue("orders-stream", redis);

      await queue.sendMessageBatch([
        {
          id: "e1",
          body: { data: "value" },
          options: {
            groupId: "group-1",
            deduplicationId: "dedup-1",
            attributes: { key: "val" },
          },
        },
      ]);

      const xaddArgs = pipeline.xadd.mock.calls[0];
      expect(xaddArgs).toContain("group_id");
      expect(xaddArgs).toContain("group-1");
      expect(xaddArgs).toContain("dedup_id");
      expect(xaddArgs).toContain("dedup-1");
      expect(xaddArgs).toContain("attributes");
      expect(xaddArgs).toContain('{"key":"val"}');
    });

    it("falls back to PipelineError when error has no name", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      const pipelineError = new Error("something");
      // Explicitly remove name to test fallback
      Object.defineProperty(pipelineError, "name", { value: undefined });
      pipeline.exec.mockResolvedValue([[pipelineError, null]]);
      const queue = new RedisQueue("orders-stream", redis);

      const result = await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);

      expect(result.failed[0].code).toBe("PipelineError");
    });
  });

  describe("tracer spans", () => {
    it("calls withSpan for sendMessage with correct name and attributes", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("100-0");
      const tracer = mockTracer();
      const queue = new RedisQueue("orders-stream", redis, tracer);

      await queue.sendMessage({ data: "value" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.queue.send_message",
        expect.any(Function),
        { "queue.stream": "orders-stream" },
      );
    });

    it("calls withSpan for sendMessageBatch with correct name and attributes", async () => {
      const pipeline = mockPipeline();
      vi.mocked(redis.pipeline).mockReturnValue(pipeline as never);
      pipeline.exec.mockResolvedValue([[null, "100-0"]]);
      const tracer = mockTracer();
      const queue = new RedisQueue("orders-stream", redis, tracer);

      await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.queue.send_message_batch",
        expect.any(Function),
        { "queue.stream": "orders-stream", "queue.message_count": 1 },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      vi.mocked(redis.xadd).mockResolvedValue("100-0");
      const queue = new RedisQueue("orders-stream", redis);

      const result = await queue.sendMessage({ data: "value" });
      expect(result.messageId).toBe("100-0");
    });
  });
});
