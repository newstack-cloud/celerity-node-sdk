import "reflect-metadata";
import type { HttpRequest, Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";

export type ParamType =
  | "body"
  | "query"
  | "param"
  | "headers"
  | "auth"
  | "token"
  | "request"
  | "cookies"
  | "requestId"
  // WebSocket
  | "connectionId"
  | "messageBody"
  | "messageId"
  | "requestContext"
  | "eventType"
  // Consumer
  | "messages"
  | "consumerEvent"
  | "consumerVendor"
  | "consumerTraceContext"
  // Schedule
  | "scheduleInput"
  | "scheduleId"
  | "scheduleExpression"
  | "scheduleEvent"
  // Custom / Invocable
  | "payload"
  | "invokeContext";

export type ParamMetadata = {
  index: number;
  type: ParamType;
  key?: string;
  schema?: Schema;
};

function createParamDecorator(
  type: ParamType,
  keyOrSchema?: string | Schema,
  schema?: Schema,
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (!propertyKey) return;

    const existing: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, target, propertyKey) ?? [];

    const meta: ParamMetadata = { index: parameterIndex, type };

    if (typeof keyOrSchema === "string") {
      meta.key = keyOrSchema;
      if (schema) meta.schema = schema;
    } else if (keyOrSchema && typeof keyOrSchema === "object") {
      meta.schema = keyOrSchema;
    }

    existing.push(meta);
    Reflect.defineMetadata(PARAM_METADATA, existing, target, propertyKey);
  };
}

/**
 * Injects the parsed JSON request body into a handler parameter.
 * The raw `textBody` is JSON-parsed automatically; returns `null` if empty.
 *
 * @param schema - Optional Zod-compatible schema (`{ parse(data): T }`) for
 *   body validation. When provided, the parsed body is passed through
 *   `schema.parse()` before injection.
 */
export function Body(schema?: Schema): ParameterDecorator {
  return createParamDecorator("body", schema);
}

/**
 * Injects query string parameters into a handler parameter.
 *
 * - `@Query()` — injects the full query object (`Record<string, string | string[]>`)
 * - `@Query("key")` — injects a single query parameter value
 * - `@Query(schema)` — injects the full query object, validated through `schema.parse()`
 * - `@Query("key", schema)` — injects a single value, validated through `schema.parse()`
 */
export function Query(): ParameterDecorator;
export function Query(key: string): ParameterDecorator;
export function Query(schema: Schema): ParameterDecorator;
export function Query(key: string, schema: Schema): ParameterDecorator;
export function Query(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("query", keyOrSchema, schema);
}

/**
 * Injects path parameters into a handler parameter. Path params use `{param}`
 * format in route definitions (matching blueprint conventions).
 *
 * - `@Param()` — injects the full path params object (`Record<string, string>`)
 * - `@Param("id")` — injects a single path parameter value
 * - `@Param(schema)` — injects the full params object, validated through `schema.parse()`
 * - `@Param("id", schema)` — injects a single value, validated through `schema.parse()`
 */
export function Param(): ParameterDecorator;
export function Param(key: string): ParameterDecorator;
export function Param(schema: Schema): ParameterDecorator;
export function Param(key: string, schema: Schema): ParameterDecorator;
export function Param(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("param", keyOrSchema, schema);
}

/**
 * Injects request headers into a handler parameter.
 *
 * - `@Headers()` — injects the full headers object (`Record<string, string | string[]>`)
 * - `@Headers("content-type")` — injects a single header value
 * - `@Headers(schema)` — injects the full headers object, validated through `schema.parse()`
 * - `@Headers("key", schema)` — injects a single value, validated through `schema.parse()`
 */
export function Headers(): ParameterDecorator;
export function Headers(key: string): ParameterDecorator;
export function Headers(schema: Schema): ParameterDecorator;
export function Headers(key: string, schema: Schema): ParameterDecorator;
export function Headers(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("headers", keyOrSchema, schema);
}

/**
 * Injects the decoded auth payload from the request. This is the identity
 * object populated by guards (e.g. decoded JWT claims), or `null` if the
 * request is unauthenticated.
 */
export function Auth(): ParameterDecorator {
  return createParamDecorator("auth");
}

/**
 * Injects the raw auth token string from the request (e.g. the Bearer token
 * from the Authorization header). This is the unprocessed token before guard
 * validation — use `@Auth()` for the decoded identity payload.
 */
export function Token(): ParameterDecorator {
  return createParamDecorator("token");
}

/**
 * Injects the full `HttpRequest` object into a handler parameter. Use this
 * when you need access to the entire request beyond what individual param
 * decorators provide.
 */
export function Req(): ParameterDecorator {
  return createParamDecorator("request");
}

/**
 * Injects request cookies into a handler parameter.
 *
 * - `@Cookies()` — injects the full cookies object (`Record<string, string>`)
 * - `@Cookies("session")` — injects a single cookie value
 */
export function Cookies(key?: string): ParameterDecorator {
  return createParamDecorator("cookies", key);
}

/**
 * Injects the unique request ID assigned to this request by the runtime
 * or API Gateway.
 */
export function RequestId(): ParameterDecorator {
  return createParamDecorator("requestId");
}

export function extractParam(
  type: ParamType,
  key: string | undefined,
  request: HttpRequest,
): unknown {
  switch (type) {
    case "body":
      return request.textBody ? JSON.parse(request.textBody) : null;
    case "query":
      return key ? request.query[key] : request.query;
    case "param":
      return key ? request.pathParams[key] : request.pathParams;
    case "headers":
      return key ? request.headers[key] : request.headers;
    case "auth":
      return request.auth;
    case "request":
      return request;
    case "cookies":
      return key ? request.cookies[key] : request.cookies;
    case "requestId":
      return request.requestId;
  }
}
