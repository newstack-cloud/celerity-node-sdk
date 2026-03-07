import {
  SNSClient,
  CreateTopicCommand,
  DeleteTopicCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";

const LOCALSTACK_ENDPOINT = "http://localhost:4566";
const LOCALSTACK_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" };
const LOCALSTACK_REGION = "us-east-1";

const STANDARD_TOPIC = "test-topic";
const FIFO_TOPIC = "test-topic.fifo";
const SUBSCRIBER_QUEUE = "test-topic-subscriber";
const FIFO_SUBSCRIBER_QUEUE = "test-topic-fifo-subscriber.fifo";

function createSNSClient(): SNSClient {
  return new SNSClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });
}

function createSQSClient(): SQSClient {
  return new SQSClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: LOCALSTACK_REGION,
    credentials: LOCALSTACK_CREDENTIALS,
  });
}

export async function setup() {
  const sns = createSNSClient();
  const sqs = createSQSClient();

  // --- Create SNS Topics ---
  let standardTopicArn: string;
  let fifoTopicArn: string;

  try {
    const res = await sns.send(new CreateTopicCommand({ Name: STANDARD_TOPIC }));
    standardTopicArn = res.TopicArn!;
  } catch {
    standardTopicArn = `arn:aws:sns:${LOCALSTACK_REGION}:000000000000:${STANDARD_TOPIC}`;
  }

  try {
    const res = await sns.send(
      new CreateTopicCommand({
        Name: FIFO_TOPIC,
        Attributes: { FifoTopic: "true", ContentBasedDeduplication: "false" },
      }),
    );
    fifoTopicArn = res.TopicArn!;
  } catch {
    fifoTopicArn = `arn:aws:sns:${LOCALSTACK_REGION}:000000000000:${FIFO_TOPIC}`;
  }

  // --- Create SQS Subscriber Queues ---
  try {
    await sqs.send(new CreateQueueCommand({ QueueName: SUBSCRIBER_QUEUE }));
  } catch {
    // May already exist
  }

  try {
    await sqs.send(
      new CreateQueueCommand({
        QueueName: FIFO_SUBSCRIBER_QUEUE,
        Attributes: { FifoQueue: "true", ContentBasedDeduplication: "false" },
      }),
    );
  } catch {
    // May already exist
  }

  // Purge subscriber queues
  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: SUBSCRIBER_QUEUE }));
    await sqs.send(new PurgeQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore
  }

  // --- Subscribe SQS Queues to SNS Topics ---
  const stdQueueUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: SUBSCRIBER_QUEUE })))
    .QueueUrl!;
  const stdQueueArn = (
    await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: stdQueueUrl,
        AttributeNames: ["QueueArn"],
      }),
    )
  ).Attributes!.QueueArn!;

  await sns.send(
    new SubscribeCommand({
      TopicArn: standardTopicArn,
      Protocol: "sqs",
      Endpoint: stdQueueArn,
      Attributes: { RawMessageDelivery: "true" },
    }),
  );

  const fifoQueueUrl = (
    await sqs.send(new GetQueueUrlCommand({ QueueName: FIFO_SUBSCRIBER_QUEUE }))
  ).QueueUrl!;
  const fifoQueueArn = (
    await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: fifoQueueUrl,
        AttributeNames: ["QueueArn"],
      }),
    )
  ).Attributes!.QueueArn!;

  await sns.send(
    new SubscribeCommand({
      TopicArn: fifoTopicArn,
      Protocol: "sqs",
      Endpoint: fifoQueueArn,
      Attributes: { RawMessageDelivery: "true" },
    }),
  );

  sns.destroy();
  sqs.destroy();
}

export async function teardown() {
  const sns = createSNSClient();
  const sqs = createSQSClient();

  // Unsubscribe and delete topics
  try {
    const standardTopicArn = `arn:aws:sns:${LOCALSTACK_REGION}:000000000000:${STANDARD_TOPIC}`;
    // List and remove subscriptions would be ideal but for local cleanup, deleting the topic works
    await sns.send(new DeleteTopicCommand({ TopicArn: standardTopicArn }));
  } catch {
    // Ignore
  }

  try {
    const fifoTopicArn = `arn:aws:sns:${LOCALSTACK_REGION}:000000000000:${FIFO_TOPIC}`;
    await sns.send(new DeleteTopicCommand({ TopicArn: fifoTopicArn }));
  } catch {
    // Ignore
  }

  // Delete subscriber queues
  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: SUBSCRIBER_QUEUE }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore
  }

  try {
    const urlRes = await sqs.send(new GetQueueUrlCommand({ QueueName: FIFO_SUBSCRIBER_QUEUE }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: urlRes.QueueUrl }));
  } catch {
    // Ignore
  }

  sns.destroy();
  sqs.destroy();
}
