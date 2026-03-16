// Core types
export {
  TopicClient,
  type PublishOptions,
  type PublishResult,
  type BatchPublishEntry,
  type BatchPublishResult,
  type BatchPublishSuccess,
  type BatchPublishFailure,
} from "./types";

export type { SNSTopicConfig } from "./providers/sns/types";
export type { RedisTopicConfig } from "./providers/redis/types";

export { createTopicClient } from "./factory";
export type { CreateTopicClientOptions } from "./factory";

export { Topic, topicToken, DEFAULT_TOPIC_TOKEN } from "./decorators";

export { getTopic } from "./helpers";

export { TopicLayer } from "./layer";

export { TopicError } from "./errors";
