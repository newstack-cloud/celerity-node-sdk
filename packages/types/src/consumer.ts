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

/** Individual message processing failure for partial failure reporting. */
export type MessageProcessingFailure = {
  messageId: string;
  errorMessage?: string;
};

/** Result returned from consumer and schedule handlers. */
export type EventResult = {
  success: boolean;
  failures?: MessageProcessingFailure[];
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
