import "reflect-metadata";
import type { Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";
import type { ParamMetadata } from "./params";

function createWsParamDecorator(type: ParamMetadata["type"], schema?: Schema): ParameterDecorator {
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
 * Injects the WebSocket connection ID into a handler parameter.
 * This is the unique identifier for the client's connection, used to send
 * messages back via `WebSocketSender.sendMessage(connectionId, data)`.
 */
export function ConnectionId(): ParameterDecorator {
  return createWsParamDecorator("connectionId");
}

/**
 * Injects the parsed message body from a WebSocket message event.
 * Returns the `jsonBody` field from the `WebSocketMessage`.
 *
 * @param schema - Optional Zod-compatible schema (`{ parse(data): T }`) for
 *   body validation. When provided, the body is passed through
 *   `schema.parse()` before injection.
 */
export function MessageBody(schema?: Schema): ParameterDecorator {
  return createWsParamDecorator("messageBody", schema);
}

/**
 * Injects the unique message ID from a WebSocket message event.
 */
export function MessageId(): ParameterDecorator {
  return createWsParamDecorator("messageId");
}

/**
 * Injects the `WebSocketRequestContext` from the connection handshake.
 * Contains request metadata from the initial HTTP upgrade: request ID,
 * path, headers, query params, cookies, client IP, and auth payload.
 */
export function RequestContext(): ParameterDecorator {
  return createWsParamDecorator("requestContext");
}

/**
 * Injects the WebSocket event type: `"connect"`, `"message"`, or
 * `"disconnect"`. Useful when a single method handles multiple event types.
 */
export function EventType(): ParameterDecorator {
  return createWsParamDecorator("eventType");
}
