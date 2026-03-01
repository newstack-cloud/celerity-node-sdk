import "reflect-metadata";
import type { Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";
import type { ParamMetadata } from "./params";

function createConsumerParamDecorator(
  type: ParamMetadata["type"],
  schema?: Schema,
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (!propertyKey) return;

    const existing: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, target, propertyKey) ?? [];

    const meta: ParamMetadata = { index: parameterIndex, type };
    if (schema) meta.schema = schema;

    existing.push(meta);
    Reflect.defineMetadata(PARAM_METADATA, existing, target, propertyKey);
  };
}

/**
 * Injects the message batch into a `@MessageHandler()` method parameter.
 *
 * - **Without a schema:** injects `ConsumerMessage[]` with raw `body: string`
 *   fields. The handler is responsible for parsing each message body.
 * - **With a schema:** the pipeline JSON-parses each `msg.body` and runs
 *   `schema.parse()`. Messages that pass validation are injected as
 *   `ValidatedConsumerMessage<T>[]` with a typed `parsedBody` field. Messages
 *   that fail JSON parsing or schema validation are excluded from the batch
 *   and automatically reported as `MessageProcessingFailure` entries, merged
 *   into the handler's returned `EventResult`.
 *
 * @param schema - Optional Zod-compatible schema (`{ parse(data): T }`) for
 *   per-message body validation.
 */
export function Messages(schema?: Schema): ParameterDecorator {
  return createConsumerParamDecorator("messages", schema);
}

/**
 * Injects the full `ConsumerEventInput` envelope into a `@MessageHandler()`
 * method parameter. This includes the raw message batch, handler tag, vendor
 * metadata, and trace context.
 *
 * Use this when you need access to the entire event beyond just the messages —
 * for example, to inspect `vendor` metadata or `traceContext`. Analogous to
 * `@Req()` for HTTP handlers.
 */
export function EventInput(): ParameterDecorator {
  return createConsumerParamDecorator("consumerEvent");
}

/**
 * Injects the vendor-specific metadata from the consumer event. This is the
 * platform-specific envelope data (e.g. SQS event source ARN, Kafka topic
 * metadata) — not the per-message vendor attributes.
 *
 * Equivalent to `event.vendor` from `@EventInput()`.
 */
export function Vendor(): ParameterDecorator {
  return createConsumerParamDecorator("consumerVendor");
}

/**
 * Injects the trace context from the consumer event, if present.
 *
 * Returns `Record<string, string>` containing W3C Trace Context headers
 * (e.g. `traceparent`) and platform-specific trace IDs, or `null` if no
 * trace context was propagated.
 */
export function ConsumerTraceContext(): ParameterDecorator {
  return createConsumerParamDecorator("consumerTraceContext");
}
