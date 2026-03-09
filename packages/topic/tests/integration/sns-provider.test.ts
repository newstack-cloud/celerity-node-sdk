import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
  SNSClient,
  CreateTopicCommand,
} from "@aws-sdk/client-sns";
import {
  SQSClient,
  ReceiveMessageCommand,
  GetQueueUrlCommand,
  PurgeQueueCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { SNSTopicClient } from "../../src/providers/sns/sns-topic-client";

const config = {
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

const client = new SNSTopicClient(config);

let standardTopicArn: string;
let fifoTopicArn: string;
let subscriberQueueUrl: string;
let fifoSubscriberQueueUrl: string;

// Raw clients for setup/verification
const rawSNS = new SNSClient({
  endpoint: config.endpoint,
  region: config.region,
  credentials: config.credentials,
});
const rawSQS = new SQSClient({
  endpoint: config.endpoint,
  region: config.region,
  credentials: config.credentials,
});

beforeAll(async () => {
  // Resolve topic ARNs (created by global-setup)
  const stdRes = await rawSNS.send(new CreateTopicCommand({ Name: "test-topic" }));
  standardTopicArn = stdRes.TopicArn!;

  const fifoRes = await rawSNS.send(
    new CreateTopicCommand({
      Name: "test-topic.fifo",
      Attributes: { FifoTopic: "true", ContentBasedDeduplication: "false" },
    }),
  );
  fifoTopicArn = fifoRes.TopicArn!;

  // Resolve subscriber queue URLs
  subscriberQueueUrl = (
    await rawSQS.send(new GetQueueUrlCommand({ QueueName: "test-topic-subscriber" }))
  ).QueueUrl!;

  fifoSubscriberQueueUrl = (
    await rawSQS.send(new GetQueueUrlCommand({ QueueName: "test-topic-fifo-subscriber.fifo" }))
  ).QueueUrl!;
});

afterAll(() => {
  client.close();
  rawSNS.destroy();
  rawSQS.destroy();
});

async function receiveMessages(queueUrl: string, count: number, timeoutMs = 8_000) {
  const collected: Message[] = [];
  const deadline = Date.now() + timeoutMs;

  while (collected.length < count && Date.now() < deadline) {
    const res = await rawSQS.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: count,
        WaitTimeSeconds: 2,
        MessageAttributeNames: ["All"],
      }),
    );
    if (res.Messages) collected.push(...res.Messages);
  }

  return collected;
}

async function purgeQueue(queueUrl: string) {
  try {
    await rawSQS.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
  } catch {
    // Ignore — may have been purged recently
  }
}

describe("SNS Provider (integration)", () => {
  describe("publish", () => {
    it("should publish a message and receive it via SQS subscription", async () => {
      await purgeQueue(subscriberQueueUrl);

      const topic = client.topic(standardTopicArn);
      const result = await topic.publish({ orderId: "order-1", total: 42 });

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe("string");

      const messages = await receiveMessages(subscriberQueueUrl, 1);
      expect(messages).toHaveLength(1);
      // Raw delivery — body is the JSON-serialized message
      const body = JSON.parse(messages[0].Body!);
      expect(body.orderId).toBe("order-1");
      expect(body.total).toBe(42);
    });

    it("should publish a message with attributes and receive them", async () => {
      await purgeQueue(subscriberQueueUrl);

      const topic = client.topic(standardTopicArn);
      await topic.publish(
        { data: "with-attrs" },
        { attributes: { env: "test", priority: "high" } },
      );

      const messages = await receiveMessages(subscriberQueueUrl, 1);
      expect(messages).toHaveLength(1);
      expect(messages[0].MessageAttributes?.env?.StringValue).toBe("test");
      expect(messages[0].MessageAttributes?.priority?.StringValue).toBe("high");
    });

    it("should publish to a FIFO topic with groupId and deduplicationId", async () => {
      const topic = client.topic(fifoTopicArn);
      const result = await topic.publish(
        { action: "process" },
        { groupId: "group-1", deduplicationId: `dedup-${Date.now()}` },
      );

      expect(result.messageId).toBeDefined();

      const messages = await receiveMessages(fifoSubscriberQueueUrl, 1);
      expect(messages).toHaveLength(1);
      const body = JSON.parse(messages[0].Body!);
      expect(body.action).toBe("process");
    });
  });

  describe("publishBatch", () => {
    it("should publish a batch of messages and receive all of them", async () => {
      await purgeQueue(subscriberQueueUrl);

      const topic = client.topic(standardTopicArn);
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        body: { index: i },
      }));

      const result = await topic.publishBatch(entries);

      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
      for (const s of result.successful) {
        expect(s.messageId).toBeDefined();
      }

      // Verify by receiving (may need multiple receives for 5 messages)
      const messages = await receiveMessages(subscriberQueueUrl, 10);
      expect(messages.length).toBeGreaterThanOrEqual(5);
    });

    it("should auto-chunk batches larger than 10 entries", async () => {
      await purgeQueue(subscriberQueueUrl);

      const topic = client.topic(standardTopicArn);
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: `batch-${i}`,
        body: { index: i },
      }));

      const result = await topic.publishBatch(entries);

      expect(result.successful).toHaveLength(15);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe("error cases", () => {
    it("should throw TopicError when publishing to a non-existent topic ARN", async () => {
      const topic = client.topic(
        "arn:aws:sns:us-east-1:000000000000:non-existent-topic",
      );

      await expect(topic.publish({ data: "fail" })).rejects.toThrow(
        /Failed to publish message/,
      );
    });
  });
});
