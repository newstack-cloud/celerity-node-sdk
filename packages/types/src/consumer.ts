import type { BaseHandlerContext } from "./handler";

/**
 * A single attribute value in the SQS-compatible format used by all consumers.
 * `stringValue` is optional because binary-typed attributes may omit it.
 */
export type MessageAttributeValue = {
  dataType: string;
  stringValue?: string;
  binaryValue?: string;
};

/** Key-value map of message attributes attached to a consumer message. */
export type MessageAttributes = Record<string, MessageAttributeValue>;

/** A single message from an event source. */
export type ConsumerMessage = {
  messageId: string;
  body: string;
  source: string;
  sourceType?: string;
  sourceName?: string;
  eventType?: string;
  messageAttributes: MessageAttributes;
  vendor: unknown;
};

/** Consumer source types corresponding to Celerity resource kinds. */
export const SourceType = {
  Bucket: "bucket",
  Datastore: "datastore",
  Queue: "queue",
  Topic: "topic",
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

/** Celerity-standard bucket event types (mapped from cloud-specific names). */
export const BucketEventType = {
  Created: "created",
  Deleted: "deleted",
  MetadataUpdated: "metadataUpdated",
} as const;
export type BucketEventType = (typeof BucketEventType)[keyof typeof BucketEventType];

/** Celerity-standard datastore event types (mapped from cloud-specific names). */
export const DatastoreEventType = {
  Inserted: "inserted",
  Modified: "modified",
  Removed: "removed",
} as const;
export type DatastoreEventType = (typeof DatastoreEventType)[keyof typeof DatastoreEventType];

/** Celerity-standard bucket event body shape. */
export type BucketEvent = {
  key: string;
  size?: number;
  eTag?: string;
};

/** Celerity-standard datastore event body shape. */
export type DatastoreEvent = {
  keys: Record<string, unknown>;
  newItem?: Record<string, unknown>;
  oldItem?: Record<string, unknown>;
};

/** Input provided to a consumer handler — a batch of messages. */
export type ConsumerEventInput = {
  handlerTag: string;
  messages: ConsumerMessage[];
  vendor: unknown;
  traceContext?: Record<string, string> | null;
};

/** Context for consumer event handlers. */
export type ConsumerHandlerContext = BaseHandlerContext & {
  event: ConsumerEventInput;
};

/** One message in a batch that could not be processed. */
export type MessageProcessingFailure = {
  /**
   * Must be the `messageId` the message arrived with. A message ID matching
   * nothing in the batch would leave nothing behind, so the runtime refuses
   * the whole answer rather than acknowledging a batch it cannot apply.
   */
  messageId: string;
  errorMessage?: string;
};

/**
 * Result returned from consumer and schedule handlers.
 *
 * For a source that acknowledges, a queue, a topic or a schedule, this decides
 * what happens to the message rather than only reporting what happened. A
 * success acknowledges it and it is not delivered again; a failure leaves it
 * on its source, which redelivers it according to its own rules.
 */
export type EventResult = {
  /**
   * Whether the event was processed successfully.
   *
   * Reporting success for work the handler did not do means never seeing that
   * work again.
   */
  success: boolean;
  /**
   * The messages in a batch that could not be processed.
   *
   * Naming messages is how a handler answers for each one separately, those
   * named are left on the source to be delivered again and the rest are
   * acknowledged, so a handler that processed most of a batch does not have
   * all of it sent back. Failing without naming any answers for the whole
   * batch, and none of it is acknowledged.
   *
   * A non-empty list is taken as the answer even alongside `success: true`.
   * Ignored for schedule handlers, which receive one message and have nothing
   * to name.
   */
  failures?: MessageProcessingFailure[];
  /** Optional error message, used for schedule handler failures. */
  errorMessage?: string;
};

/**
 * A consumer message with a schema-validated parsed body.
 * Returned by @Messages(schema) and createConsumerHandler({ messageSchema }).
 * Retains all original ConsumerMessage fields so the handler can
 * correlate parsed bodies with message metadata (messageId, source, etc.).
 */
export type ValidatedConsumerMessage<T> = ConsumerMessage & {
  parsedBody: T;
};
