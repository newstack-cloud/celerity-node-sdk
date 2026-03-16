import "reflect-metadata";
import {
  CONSUMER_METADATA,
  CONSUMER_HANDLER_METADATA,
  INJECTABLE_METADATA,
} from "../metadata/constants";

export type ConsumerMetadata = {
  source?: string;
};

export type ConsumerHandlerMetadata = {
  route?: string;
};

/**
 * Marks a class as a consumer controller that processes batches of messages
 * from an event source (SQS, Kafka, Pub/Sub, etc.).
 *
 * The class becomes injectable and its `@MessageHandler()` methods are
 * registered as consumer handler callbacks.
 *
 * @param source - Optional blueprint resource name that tells the deploy engine
 *   which blueprint-defined consumer resource this handler should be wired to.
 *   Does not create infrastructure — the blueprint defines the actual source.
 *
 * @example
 * ```ts
 * @Consumer("ordersConsumer")
 * class OrderConsumer {
 *   @MessageHandler()
 *   async process(@Messages(OrderSchema) messages: ValidatedConsumerMessage<Order>[]): Promise<EventResult> {
 *     // ...
 *   }
 * }
 * ```
 */
export function Consumer(source?: string): ClassDecorator {
  return (target) => {
    const meta: ConsumerMetadata = {};
    if (source !== undefined) meta.source = source;
    Reflect.defineMetadata(CONSUMER_METADATA, meta, target);
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}

/**
 * Marks a method inside a `@Consumer()` class as a message handler.
 *
 * The method should return `Promise<EventResult>` with partial failure
 * semantics — individual message failures are reported via `failures[]`
 * without failing the entire batch.
 *
 * @param route - Optional routing key for message dispatching. The CLI
 *   extracts this as `celerity.handler.consumer.route` and the deploy engine
 *   merges it into the consumer source's routing configuration. The blueprint
 *   can override. When omitted, the method name is used as the handler tag.
 */
export function MessageHandler(route?: string): MethodDecorator {
  return (target, propertyKey) => {
    const meta: ConsumerHandlerMetadata = {};
    if (route !== undefined) meta.route = route;
    Reflect.defineMetadata(CONSUMER_HANDLER_METADATA, meta, target, propertyKey);
  };
}
