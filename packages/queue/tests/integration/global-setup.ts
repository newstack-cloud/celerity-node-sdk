import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";
import Redis from "ioredis";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const LOCALSTACK_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
const LOCALSTACK_REGION = "us-east-1";

const REDIS_URL = "redis://localhost:6399";

const STANDARD_QUEUE = "test-queue";
const FIFO_QUEUE = "test-queue.fifo";
const REDIS_STREAM = "test-stream";

function createSQSClient(): SQSClient {
  return new SQSClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });
}

export async function setup() {
  // --- SQS Queues ---
  const sqs = createSQSClient();

  try {
    await sqs.send(new CreateQueueCommand({ QueueName: STANDARD_QUEUE }));
  } catch {
    // Queue may already exist from a previous run
  }

  try {
    await sqs.send(
      new CreateQueueCommand({
        QueueName: FIFO_QUEUE,
        Attributes: {
          FifoQueue: "true",
          ContentBasedDeduplication: "false",
        },
      }),
    );
  } catch {
    // Queue may already exist from a previous run
  }

  // Purge queues to start clean
  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: STANDARD_QUEUE }));
    await sqs.send(new PurgeQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore if purge fails (e.g. already purged recently)
  }

  sqs.destroy();

  // --- Redis Stream ---
  const redis = new Redis(REDIS_URL);
  try {
    // Delete the stream if it exists to start clean
    await redis.del(REDIS_STREAM);
  } catch {
    // Ignore
  }
  await redis.quit();
}

export async function teardown() {
  // --- SQS Cleanup ---
  const sqs = createSQSClient();
  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: STANDARD_QUEUE }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore cleanup errors
  }
  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: FIFO_QUEUE }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore cleanup errors
  }
  sqs.destroy();

  // --- Redis Cleanup ---
  const redis = new Redis(REDIS_URL);
  try {
    await redis.del(REDIS_STREAM);
  } catch {
    // Ignore
  }
  await redis.quit();
}
