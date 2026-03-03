import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { SQSQueue } from "../../src/providers/sqs/sqs-queue";
import { QueueError } from "../../src/errors";

// --- Mocks ---

function mockClient(overrides?: Partial<SQSClient>): SQSClient {
  return {
    send: vi.fn(),
    ...overrides,
  } as unknown as SQSClient;
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

describe("SQSQueue", () => {
  let client: SQSClient;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = mockClient();
    sendMock = vi.mocked(client.send);
  });

  describe("sendMessage", () => {
    it("sends a basic message with JSON-serialized body", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);

      const result = await queue.sendMessage({ orderId: "abc" });

      expect(result.messageId).toBe("msg-123");
      expect(sendMock).toHaveBeenCalledOnce();
      const command = sendMock.mock.calls[0][0];
      expect(command.input.QueueUrl).toBe(
        "https://sqs.us-east-1.amazonaws.com/123/my-queue",
      );
      expect(command.input.MessageBody).toBe('{"orderId":"abc"}');
    });

    it("passes all options to SQS command", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-456" });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue.fifo", client);

      await queue.sendMessage(
        { data: "value" },
        {
          groupId: "group-1",
          deduplicationId: "dedup-1",
          delaySeconds: 30,
          attributes: { env: "prod", priority: "high" },
        },
      );

      const command = sendMock.mock.calls[0][0];
      expect(command.input.MessageGroupId).toBe("group-1");
      expect(command.input.MessageDeduplicationId).toBe("dedup-1");
      expect(command.input.DelaySeconds).toBe(30);
      expect(command.input.MessageAttributes).toEqual({
        env: { DataType: "String", StringValue: "prod" },
        priority: { DataType: "String", StringValue: "high" },
      });
    });

    it("does not send MessageAttributes when attributes are undefined", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-789" });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);

      await queue.sendMessage({ data: "value" });

      const command = sendMock.mock.calls[0][0];
      expect(command.input.MessageAttributes).toBeUndefined();
    });

    it("wraps SDK errors in QueueError with cause", async () => {
      const sdkError = new Error("AccessDenied");
      sendMock.mockRejectedValue(sdkError);
      const queueUrl = "https://sqs.us-east-1.amazonaws.com/123/my-queue";
      const queue = new SQSQueue(queueUrl, client);

      await expect(queue.sendMessage({ data: "value" })).rejects.toThrow(QueueError);
      try {
        await queue.sendMessage({ data: "value" });
      } catch (error) {
        expect(error).toBeInstanceOf(QueueError);
        expect((error as QueueError).queue).toBe(queueUrl);
        expect((error as QueueError).cause).toBe(sdkError);
        expect((error as QueueError).message).toContain(queueUrl);
      }
    });
  });

  describe("sendMessageBatch", () => {
    it("sends a batch of messages (≤10)", async () => {
      sendMock.mockResolvedValue({
        Successful: [
          { Id: "e1", MessageId: "msg-1" },
          { Id: "e2", MessageId: "msg-2" },
        ],
        Failed: [],
      });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);

      const result = await queue.sendMessageBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toEqual([
        { id: "e1", messageId: "msg-1" },
        { id: "e2", messageId: "msg-2" },
      ]);
      expect(result.failed).toEqual([]);
      expect(sendMock).toHaveBeenCalledOnce();
    });

    it("auto-chunks batches larger than 10 into multiple requests", async () => {
      // First chunk: entries 0-9
      sendMock.mockResolvedValueOnce({
        Successful: Array.from({ length: 10 }, (_, i) => ({
          Id: `e${i}`,
          MessageId: `msg-${i}`,
        })),
        Failed: [],
      });
      // Second chunk: entries 10-14
      sendMock.mockResolvedValueOnce({
        Successful: Array.from({ length: 5 }, (_, i) => ({
          Id: `e${i + 10}`,
          MessageId: `msg-${i + 10}`,
        })),
        Failed: [],
      });

      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await queue.sendMessageBatch(entries);

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(result.successful).toHaveLength(15);
      expect(result.failed).toHaveLength(0);

      // Verify first chunk has 10 entries, second has 5
      const firstCommand = sendMock.mock.calls[0][0];
      const secondCommand = sendMock.mock.calls[1][0];
      expect(firstCommand.input.Entries).toHaveLength(10);
      expect(secondCommand.input.Entries).toHaveLength(5);
    });

    it("reports partial failures from SQS", async () => {
      sendMock.mockResolvedValue({
        Successful: [{ Id: "e1", MessageId: "msg-1" }],
        Failed: [{ Id: "e2", Code: "InternalError", Message: "Something went wrong" }],
      });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);

      const result = await queue.sendMessageBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toEqual([{ id: "e1", messageId: "msg-1" }]);
      expect(result.failed).toEqual([
        { id: "e2", code: "InternalError", message: "Something went wrong" },
      ]);
    });

    it("passes per-message options to SQS batch entries", async () => {
      sendMock.mockResolvedValue({ Successful: [{ Id: "e1", MessageId: "msg-1" }], Failed: [] });
      const queue = new SQSQueue(
        "https://sqs.us-east-1.amazonaws.com/123/my-queue.fifo",
        client,
      );

      await queue.sendMessageBatch([
        {
          id: "e1",
          body: { data: "value" },
          options: {
            groupId: "group-1",
            deduplicationId: "dedup-1",
            delaySeconds: 10,
            attributes: { key: "val" },
          },
        },
      ]);

      const command = sendMock.mock.calls[0][0];
      const entry = command.input.Entries[0];
      expect(entry.MessageGroupId).toBe("group-1");
      expect(entry.MessageDeduplicationId).toBe("dedup-1");
      expect(entry.DelaySeconds).toBe(10);
      expect(entry.MessageAttributes).toEqual({
        key: { DataType: "String", StringValue: "val" },
      });
    });

    it("wraps SDK errors in QueueError with cause", async () => {
      const sdkError = new Error("ServiceUnavailable");
      sendMock.mockRejectedValue(sdkError);
      const queueUrl = "https://sqs.us-east-1.amazonaws.com/123/my-queue";
      const queue = new SQSQueue(queueUrl, client);

      await expect(
        queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]),
      ).rejects.toThrow(QueueError);
      try {
        await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);
      } catch (error) {
        expect(error).toBeInstanceOf(QueueError);
        expect((error as QueueError).queue).toBe(queueUrl);
        expect((error as QueueError).cause).toBe(sdkError);
      }
    });

    it("uses default 'Unknown error' when SQS failure has no message", async () => {
      sendMock.mockResolvedValue({
        Successful: [],
        Failed: [{ Id: "e1", Code: "InternalError" }],
      });
      const queue = new SQSQueue("https://sqs.us-east-1.amazonaws.com/123/my-queue", client);

      const result = await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);

      expect(result.failed[0].message).toBe("Unknown error");
    });
  });

  describe("tracer spans", () => {
    it("calls withSpan for sendMessage with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const tracer = mockTracer();
      const queueUrl = "https://sqs.us-east-1.amazonaws.com/123/my-queue";
      const queue = new SQSQueue(queueUrl, client, tracer);

      await queue.sendMessage({ data: "value" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.queue.send_message",
        expect.any(Function),
        { "queue.url": queueUrl },
      );
    });

    it("calls withSpan for sendMessageBatch with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ Successful: [{ Id: "e1", MessageId: "msg-1" }], Failed: [] });
      const tracer = mockTracer();
      const queueUrl = "https://sqs.us-east-1.amazonaws.com/123/my-queue";
      const queue = new SQSQueue(queueUrl, client, tracer);

      await queue.sendMessageBatch([{ id: "e1", body: { a: 1 } }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.queue.send_message_batch",
        expect.any(Function),
        { "queue.url": queueUrl, "queue.message_count": 1 },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const queue = new SQSQueue(
        "https://sqs.us-east-1.amazonaws.com/123/my-queue",
        client,
      );

      const result = await queue.sendMessage({ data: "value" });
      expect(result.messageId).toBe("msg-123");
    });
  });
});
