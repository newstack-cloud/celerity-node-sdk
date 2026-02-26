import type { BaseHandlerContext } from "./handler";

/** A single message from an event source. */
export type ConsumerMessage = {
  messageId: string;
  body: string;
  source: string;
  messageAttributes: unknown;
  vendor: unknown;
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
