import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
  SQSClient,
  ReceiveMessageCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import { SQSQueueClient } from "../../src/providers/sqs/sqs-queue-client";

const config = {
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

const client = new SQSQueueClient(config);

let standardQueueUrl: string;
let fifoQueueUrl: string;

// Raw SQS client for verification reads
const rawSQS = new SQSClient({
  endpoint: config.endpoint,
  region: config.region,
  credentials: config.credentials,
});

beforeAll(async () => {
  const stdRes = await rawSQS.send(new GetQueueUrlCommand({ QueueName: "test-queue" }));
  standardQueueUrl = stdRes.QueueUrl!;

  const fifoRes = await rawSQS.send(new GetQueueUrlCommand({ QueueName: "test-queue.fifo" }));
  fifoQueueUrl = fifoRes.QueueUrl!;
});

afterAll(() => {
  client.close();
  rawSQS.destroy();
});

async function receiveMessages(queueUrl: string, count: number) {
  const res = await rawSQS.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: count,
      WaitTimeSeconds: 5,
      MessageAttributeNames: ["All"],
    }),
  );
  return res.Messages ?? [];
}

describe("SQS Provider (integration)", () => {
  describe("sendMessage", () => {
    it("should send a message and receive it from the queue", async () => {
      const queue = client.queue(standardQueueUrl);
      const result = await queue.sendMessage({ orderId: "order-1", total: 42 });

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe("string");

      // Verify by receiving
      const messages = await receiveMessages(standardQueueUrl, 1);
      expect(messages).toHaveLength(1);
      const body = JSON.parse(messages[0].Body!);
      expect(body.orderId).toBe("order-1");
      expect(body.total).toBe(42);
    });

    it("should send a message with string attributes and receive them", async () => {
      const queue = client.queue(standardQueueUrl);
      await queue.sendMessage(
        { data: "with-attrs" },
        { attributes: { env: "test", priority: "high" } },
      );

      const messages = await receiveMessages(standardQueueUrl, 1);
      expect(messages).toHaveLength(1);
      expect(messages[0].MessageAttributes?.env?.StringValue).toBe("test");
      expect(messages[0].MessageAttributes?.priority?.StringValue).toBe("high");
    });

    it("should send a message to a FIFO queue with groupId and deduplicationId", async () => {
      const queue = client.queue(fifoQueueUrl);
      const result = await queue.sendMessage(
        { action: "process" },
        { groupId: "group-1", deduplicationId: "dedup-1" },
      );

      expect(result.messageId).toBeDefined();

      const messages = await receiveMessages(fifoQueueUrl, 1);
      expect(messages).toHaveLength(1);
      const body = JSON.parse(messages[0].Body!);
      expect(body.action).toBe("process");
    });
  });

  describe("sendMessageBatch", () => {
    it("should send a batch of messages and receive all of them", async () => {
      const queue = client.queue(standardQueueUrl);
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await queue.sendMessageBatch(entries);

      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
      for (const s of result.successful) {
        expect(s.messageId).toBeDefined();
      }

      // Verify by receiving (may need multiple receives for 5 messages)
      const messages = await receiveMessages(standardQueueUrl, 10);
      expect(messages.length).toBeGreaterThanOrEqual(5);
    });

    it("should auto-chunk batches larger than 10 entries", async () => {
      const queue = client.queue(standardQueueUrl);
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: `batch-${i}`,
        body: { index: i },
      }));

      const result = await queue.sendMessageBatch(entries);

      expect(result.successful).toHaveLength(15);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe("error cases", () => {
    it("should throw QueueError when sending to a non-existent queue URL", async () => {
      const queue = client.queue(
        "http://localhost:4566/000000000000/non-existent-queue",
      );

      await expect(queue.sendMessage({ data: "fail" })).rejects.toThrow(
        /Failed to send message/,
      );
    });
  });
});
