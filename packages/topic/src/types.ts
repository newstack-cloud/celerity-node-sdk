import type { Closeable } from "@celerity-sdk/types";

export const TopicClient = Symbol.for("TopicClient");

/**
 * A topic client abstraction for pub/sub topics. Provides access to named
 * topics, each representing a logical destination for published messages.
 */
export interface TopicClient extends Closeable {
  /**
   * Retrieves a topic instance by its name. The returned topic is a lightweight
   * handle — no network calls are made until an operation is invoked.
   *
   * @param name The topic identifier (SNS topic ARN, Redis channel name, etc.).
   */
  topic(name: string): Topic;
}

/**
 * A topic represents a logical pub/sub destination. It provides methods for
 * publishing messages individually or in batches. The Celerity runtime handles
 * all subscription and consumption — this interface is producer-only.
 */
export interface Topic {
  /**
   * Publish a single message to the topic. The body is serialized to JSON.
   *
   * @param body The message body (serialized to JSON string for transport).
   * @param options Optional publish parameters such as FIFO ordering or subject.
   * @returns A promise that resolves to the publish result with the provider-assigned message ID.
   */
  publish<T = Record<string, unknown>>(body: T, options?: PublishOptions): Promise<PublishResult>;

  /**
   * Publish multiple messages in a single batch. The provider may impose batch
   * size limits (e.g. SNS limits to 10 per request) — the implementation
   * handles chunking transparently.
   *
   * @param entries The batch of messages to publish, each with a caller-assigned ID for correlation.
   * @returns A promise that resolves to the batch result with successful and failed entries.
   */
  publishBatch<T = Record<string, unknown>>(
    entries: BatchPublishEntry<T>[],
  ): Promise<BatchPublishResult>;
}

/**
 * Options for the publish and publishBatch operations.
 */
export type PublishOptions = {
  /** Message group ID for FIFO topics (SNS: MessageGroupId, Pub/Sub: ordering key). */
  groupId?: string;
  /** Deduplication ID for FIFO topics. */
  deduplicationId?: string;
  /** Message subject (SNS: Subject). */
  subject?: string;
  /** String key-value message attributes (metadata sent alongside the body). */
  attributes?: Record<string, string>;
};

/**
 * The result of a single publish call.
 */
export type PublishResult = {
  /** The provider-assigned message identifier. */
  messageId: string;
};

/**
 * A single entry in a batch publish request.
 */
export type BatchPublishEntry<T = Record<string, unknown>> = {
  /** Caller-assigned ID for correlating results within the batch. */
  id: string;
  /** The message body (serialized to JSON). */
  body: T;
  /** Per-message publish options. */
  options?: PublishOptions;
};

/**
 * The result of a batch publish operation.
 */
export type BatchPublishResult = {
  /** Entries that were published successfully. */
  successful: BatchPublishSuccess[];
  /** Entries that failed. */
  failed: BatchPublishFailure[];
};

/**
 * A successfully published entry from a batch operation.
 */
export type BatchPublishSuccess = {
  /** The caller-assigned entry ID. */
  id: string;
  /** The provider-assigned message ID. */
  messageId: string;
};

/**
 * A failed entry from a batch operation.
 */
export type BatchPublishFailure = {
  /** The caller-assigned entry ID. */
  id: string;
  /** Provider error code. */
  code: string;
  /** Human-readable error message. */
  message: string;
};
