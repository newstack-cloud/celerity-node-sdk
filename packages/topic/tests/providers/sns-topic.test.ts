import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SNSClient } from "@aws-sdk/client-sns";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { SNSTopic } from "../../src/providers/sns/sns-topic";
import { TopicError } from "../../src/errors";

// --- Mocks ---

function mockClient(overrides?: Partial<SNSClient>): SNSClient {
  return {
    send: vi.fn(),
    ...overrides,
  } as unknown as SNSClient;
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

describe("SNSTopic", () => {
  let client: SNSClient;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = mockClient();
    sendMock = vi.mocked(client.send);
  });

  describe("publish", () => {
    it("publishes a basic message with JSON-serialized body", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      const result = await topic.publish({ orderId: "abc" });

      expect(result.messageId).toBe("msg-123");
      expect(sendMock).toHaveBeenCalledOnce();
      const command = sendMock.mock.calls[0][0];
      expect(command.input.TopicArn).toBe("arn:aws:sns:us-east-1:123:my-topic");
      expect(command.input.Message).toBe('{"orderId":"abc"}');
    });

    it("passes all options to SNS command", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-456" });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic.fifo", client);

      await topic.publish(
        { data: "value" },
        {
          groupId: "group-1",
          deduplicationId: "dedup-1",
          subject: "OrderCreated",
          attributes: { env: "prod", priority: "high" },
        },
      );

      const command = sendMock.mock.calls[0][0];
      expect(command.input.MessageGroupId).toBe("group-1");
      expect(command.input.MessageDeduplicationId).toBe("dedup-1");
      expect(command.input.Subject).toBe("OrderCreated");
      expect(command.input.MessageAttributes).toEqual({
        env: { DataType: "String", StringValue: "prod" },
        priority: { DataType: "String", StringValue: "high" },
      });
    });

    it("does not send MessageAttributes when attributes are undefined", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-789" });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      await topic.publish({ data: "value" });

      const command = sendMock.mock.calls[0][0];
      expect(command.input.MessageAttributes).toBeUndefined();
    });

    it("wraps SDK errors in TopicError with cause", async () => {
      const sdkError = new Error("AccessDenied");
      sendMock.mockRejectedValue(sdkError);
      const topicArn = "arn:aws:sns:us-east-1:123:my-topic";
      const topic = new SNSTopic(topicArn, client);

      const error = await topic.publish({ data: "value" }).catch((e) => e);
      expect(error).toBeInstanceOf(TopicError);
      expect((error as TopicError).topic).toBe(topicArn);
      expect((error as TopicError).cause).toBe(sdkError);
      expect((error as TopicError).message).toContain(topicArn);
    });
  });

  describe("publishBatch", () => {
    it("publishes a batch of messages (≤10)", async () => {
      sendMock.mockResolvedValue({
        Successful: [
          { Id: "e1", MessageId: "msg-1" },
          { Id: "e2", MessageId: "msg-2" },
        ],
        Failed: [],
      });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      const result = await topic.publishBatch([
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
      sendMock.mockResolvedValueOnce({
        Successful: Array.from({ length: 10 }, (_, i) => ({
          Id: `e${i}`,
          MessageId: `msg-${i}`,
        })),
        Failed: [],
      });
      sendMock.mockResolvedValueOnce({
        Successful: Array.from({ length: 5 }, (_, i) => ({
          Id: `e${i + 10}`,
          MessageId: `msg-${i + 10}`,
        })),
        Failed: [],
      });

      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await topic.publishBatch(entries);

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(result.successful).toHaveLength(15);
      expect(result.failed).toHaveLength(0);

      const firstCommand = sendMock.mock.calls[0][0];
      const secondCommand = sendMock.mock.calls[1][0];
      expect(firstCommand.input.PublishBatchRequestEntries).toHaveLength(10);
      expect(secondCommand.input.PublishBatchRequestEntries).toHaveLength(5);
    });

    it("reports partial failures from SNS", async () => {
      sendMock.mockResolvedValue({
        Successful: [{ Id: "e1", MessageId: "msg-1" }],
        Failed: [{ Id: "e2", Code: "InternalError", Message: "Something went wrong" }],
      });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      const result = await topic.publishBatch([
        { id: "e1", body: { a: 1 } },
        { id: "e2", body: { b: 2 } },
      ]);

      expect(result.successful).toEqual([{ id: "e1", messageId: "msg-1" }]);
      expect(result.failed).toEqual([
        { id: "e2", code: "InternalError", message: "Something went wrong" },
      ]);
    });

    it("passes per-message options to SNS batch entries", async () => {
      sendMock.mockResolvedValue({ Successful: [{ Id: "e1", MessageId: "msg-1" }], Failed: [] });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic.fifo", client);

      await topic.publishBatch([
        {
          id: "e1",
          body: { data: "value" },
          options: {
            groupId: "group-1",
            deduplicationId: "dedup-1",
            subject: "Test",
            attributes: { key: "val" },
          },
        },
      ]);

      const command = sendMock.mock.calls[0][0];
      const entry = command.input.PublishBatchRequestEntries[0];
      expect(entry.MessageGroupId).toBe("group-1");
      expect(entry.MessageDeduplicationId).toBe("dedup-1");
      expect(entry.Subject).toBe("Test");
      expect(entry.MessageAttributes).toEqual({
        key: { DataType: "String", StringValue: "val" },
      });
    });

    it("wraps SDK errors in TopicError with cause", async () => {
      const sdkError = new Error("ServiceUnavailable");
      sendMock.mockRejectedValue(sdkError);
      const topicArn = "arn:aws:sns:us-east-1:123:my-topic";
      const topic = new SNSTopic(topicArn, client);

      const error = await topic.publishBatch([{ id: "e1", body: { a: 1 } }]).catch((e) => e);
      expect(error).toBeInstanceOf(TopicError);
      expect((error as TopicError).topic).toBe(topicArn);
      expect((error as TopicError).cause).toBe(sdkError);
    });

    it("uses default 'Unknown error' when SNS failure has no message", async () => {
      sendMock.mockResolvedValue({
        Successful: [],
        Failed: [{ Id: "e1", Code: "InternalError" }],
      });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      const result = await topic.publishBatch([{ id: "e1", body: { a: 1 } }]);

      expect(result.failed[0].message).toBe("Unknown error");
    });
  });

  describe("tracer spans", () => {
    it("calls withSpan for publish with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const tracer = mockTracer();
      const topicArn = "arn:aws:sns:us-east-1:123:my-topic";
      const topic = new SNSTopic(topicArn, client, tracer);

      await topic.publish({ data: "value" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.topic.publish",
        expect.any(Function),
        { "topic.arn": topicArn },
      );
    });

    it("calls withSpan for publishBatch with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ Successful: [{ Id: "e1", MessageId: "msg-1" }], Failed: [] });
      const tracer = mockTracer();
      const topicArn = "arn:aws:sns:us-east-1:123:my-topic";
      const topic = new SNSTopic(topicArn, client, tracer);

      await topic.publishBatch([{ id: "e1", body: { a: 1 } }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.topic.publish_batch",
        expect.any(Function),
        { "topic.arn": topicArn, "topic.message_count": 1 },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      sendMock.mockResolvedValue({ MessageId: "msg-123" });
      const topic = new SNSTopic("arn:aws:sns:us-east-1:123:my-topic", client);

      const result = await topic.publish({ data: "value" });
      expect(result.messageId).toBe("msg-123");
    });
  });
});
