// Core types
export {
  QueueClient,
  type SendMessageOptions,
  type SendMessageResult,
  type BatchSendEntry,
  type BatchSendResult,
  type BatchSendSuccess,
  type BatchSendFailure,
} from "./types";

// Providers
export { SQSQueueClient } from "./providers/sqs/sqs-queue-client";
export type { SQSQueueConfig } from "./providers/sqs/types";
export { RedisQueueClient } from "./providers/redis/redis-queue-client";
export type { RedisQueueConfig } from "./providers/redis/types";

// Factory
export { createQueueClient } from "./factory";
export type { CreateQueueClientOptions } from "./factory";

// DI
export { Queue, queueToken, DEFAULT_QUEUE_TOKEN } from "./decorators";

// Helpers
export { getQueue } from "./helpers";

// Layer
export { QueueLayer } from "./layer";

// Errors
export { QueueError } from "./errors";
