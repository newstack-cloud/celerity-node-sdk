import type { Closeable } from "@celerity-sdk/types";

export const QueueClient = Symbol.for("QueueClient");

/**
 * A queue client abstraction for message queues. Provides access to named
 * queues, each representing a logical destination for messages.
 */
export interface QueueClient extends Closeable {
  /**
   * Retrieves a queue instance by its name. The returned queue is a lightweight
   * handle — no network calls are made until an operation is invoked.
   *
   * @param name The queue identifier (SQS queue URL, Redis stream name, etc.).
   */
  queue(name: string): Queue;
}

/**
 * A queue represents a logical message destination. It provides methods for
 * sending messages individually or in batches. The Celerity runtime handles
 * all consumption — this interface is producer-only.
 */
export interface Queue {
  /**
   * Send a single message to the queue. The body is serialized to JSON.
   *
   * @param body The message body (serialized to JSON string for transport).
   * @param options Optional send parameters such as FIFO ordering or delay.
   * @returns A promise that resolves to the send result with the provider-assigned message ID.
   */
  sendMessage<T = Record<string, unknown>>(
    body: T,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>;

  /**
   * Send multiple messages in a single batch. The provider may impose batch
   * size limits (e.g. SQS limits to 10 per request) — the implementation
   * handles chunking transparently.
   *
   * @param entries The batch of messages to send, each with a caller-assigned ID for correlation.
   * @returns A promise that resolves to the batch result with successful and failed entries.
   */
  sendMessageBatch<T = Record<string, unknown>>(
    entries: BatchSendEntry<T>[],
  ): Promise<BatchSendResult>;
}

/**
 * Options for the sendMessage and sendMessageBatch operations.
 */
export type SendMessageOptions = {
  /** Message group ID for FIFO queues (SQS: MessageGroupId, Pub/Sub: ordering key). */
  groupId?: string;
  /** Deduplication ID for FIFO queues. */
  deduplicationId?: string;
  /** Delay in seconds before the message becomes visible to consumers. */
  delaySeconds?: number;
  /** String key-value message attributes (metadata sent alongside the body). */
  attributes?: Record<string, string>;
};

/**
 * The result of a single sendMessage call.
 */
export type SendMessageResult = {
  /** The provider-assigned message identifier. */
  messageId: string;
};

/**
 * A single entry in a batch send request.
 */
export type BatchSendEntry<T = Record<string, unknown>> = {
  /** Caller-assigned ID for correlating results within the batch. */
  id: string;
  /** The message body (serialized to JSON). */
  body: T;
  /** Per-message send options. */
  options?: SendMessageOptions;
};

/**
 * The result of a batch send operation.
 */
export type BatchSendResult = {
  /** Entries that were sent successfully. */
  successful: BatchSendSuccess[];
  /** Entries that failed. */
  failed: BatchSendFailure[];
};

/**
 * A successfully sent entry from a batch operation.
 */
export type BatchSendSuccess = {
  /** The caller-assigned entry ID. */
  id: string;
  /** The provider-assigned message ID. */
  messageId: string;
};

/**
 * A failed entry from a batch operation.
 */
export type BatchSendFailure = {
  /** The caller-assigned entry ID. */
  id: string;
  /** Provider error code. */
  code: string;
  /** Human-readable error message. */
  message: string;
};
