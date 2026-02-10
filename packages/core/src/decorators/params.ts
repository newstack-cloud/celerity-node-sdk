import "reflect-metadata";
import type { HttpRequest, Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";

export type ParamType =
  | "body"
  | "query"
  | "param"
  | "headers"
  | "auth"
  | "request"
  | "cookies"
  | "requestId";

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

export function Body(schema?: Schema): ParameterDecorator {
  return createParamDecorator("body", schema);
}

export function Query(): ParameterDecorator;
export function Query(key: string): ParameterDecorator;
export function Query(schema: Schema): ParameterDecorator;
export function Query(key: string, schema: Schema): ParameterDecorator;
export function Query(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("query", keyOrSchema, schema);
}

export function Param(): ParameterDecorator;
export function Param(key: string): ParameterDecorator;
export function Param(schema: Schema): ParameterDecorator;
export function Param(key: string, schema: Schema): ParameterDecorator;
export function Param(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("param", keyOrSchema, schema);
}

export function Headers(): ParameterDecorator;
export function Headers(key: string): ParameterDecorator;
export function Headers(schema: Schema): ParameterDecorator;
export function Headers(key: string, schema: Schema): ParameterDecorator;
export function Headers(keyOrSchema?: string | Schema, schema?: Schema): ParameterDecorator {
  return createParamDecorator("headers", keyOrSchema, schema);
}

export function Auth(): ParameterDecorator {
  return createParamDecorator("auth");
}

export function Req(): ParameterDecorator {
  return createParamDecorator("request");
}

export function Cookies(key?: string): ParameterDecorator {
  return createParamDecorator("cookies", key);
}

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
