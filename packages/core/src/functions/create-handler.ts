import type {
  HttpMethod,
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";
import type { HttpHandlerRequest, HttpHandlerContext } from "./context";

export type HttpHandlerConfig<TBody = unknown> = {
  path?: string;
  method?: HttpMethod;
  schema?: {
    body?: Schema<TBody>;
    query?: Schema;
    params?: Schema;
    headers?: Schema;
  };
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  inject?: InjectionToken[];
  metadata?: Record<string, unknown>;
};

type HttpHandlerOptions<TBody = unknown> = Omit<HttpHandlerConfig<TBody>, "path" | "method">;

type HttpHandlerFn<TBody = unknown> = (
  req: HttpHandlerRequest<TBody>,
  ctx: HttpHandlerContext,
  ...deps: unknown[]
) => unknown;

export function createHttpHandler<TBody = unknown>(
  config: HttpHandlerConfig<TBody>,
  handler: HttpHandlerFn<TBody>,
): FunctionHandlerDefinition {
  const metadata: Record<string, unknown> = {
    schema: config.schema,
    layers: config.layers ?? [],
    inject: config.inject ?? [],
    customMetadata: config.metadata ?? {},
  };

  if (config.path !== undefined) metadata.path = config.path;
  if (config.method !== undefined) metadata.method = config.method;

  return {
    __celerity_handler: true,
    type: "http",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}

// -- Shorthand helpers --------------------------------------------------------

export function httpGet(path: string, handler: HttpHandlerFn): FunctionHandlerDefinition;
export function httpGet(
  path: string,
  options: HttpHandlerOptions,
  handler: HttpHandlerFn,
): FunctionHandlerDefinition;
export function httpGet(
  path: string,
  handlerOrOptions: HttpHandlerFn | HttpHandlerOptions,
  maybeHandler?: HttpHandlerFn,
): FunctionHandlerDefinition {
  if (typeof handlerOrOptions === "function") {
    return createHttpHandler({ path, method: "GET" }, handlerOrOptions);
  }
  return createHttpHandler({ path, method: "GET", ...handlerOrOptions }, maybeHandler!);
}

export function httpPost(path: string, handler: HttpHandlerFn): FunctionHandlerDefinition;
export function httpPost<TBody = unknown>(
  path: string,
  options: HttpHandlerOptions<TBody>,
  handler: HttpHandlerFn<TBody>,
): FunctionHandlerDefinition;
export function httpPost(
  path: string,
  handlerOrOptions: HttpHandlerFn | HttpHandlerOptions,
  maybeHandler?: HttpHandlerFn,
): FunctionHandlerDefinition {
  if (typeof handlerOrOptions === "function") {
    return createHttpHandler({ path, method: "POST" }, handlerOrOptions);
  }
  return createHttpHandler({ path, method: "POST", ...handlerOrOptions }, maybeHandler!);
}

export function httpPut(path: string, handler: HttpHandlerFn): FunctionHandlerDefinition;
export function httpPut<TBody = unknown>(
  path: string,
  options: HttpHandlerOptions<TBody>,
  handler: HttpHandlerFn<TBody>,
): FunctionHandlerDefinition;
export function httpPut(
  path: string,
  handlerOrOptions: HttpHandlerFn | HttpHandlerOptions,
  maybeHandler?: HttpHandlerFn,
): FunctionHandlerDefinition {
  if (typeof handlerOrOptions === "function") {
    return createHttpHandler({ path, method: "PUT" }, handlerOrOptions);
  }
  return createHttpHandler({ path, method: "PUT", ...handlerOrOptions }, maybeHandler!);
}

export function httpPatch(path: string, handler: HttpHandlerFn): FunctionHandlerDefinition;
export function httpPatch<TBody = unknown>(
  path: string,
  options: HttpHandlerOptions<TBody>,
  handler: HttpHandlerFn<TBody>,
): FunctionHandlerDefinition;
export function httpPatch(
  path: string,
  handlerOrOptions: HttpHandlerFn | HttpHandlerOptions,
  maybeHandler?: HttpHandlerFn,
): FunctionHandlerDefinition {
  if (typeof handlerOrOptions === "function") {
    return createHttpHandler({ path, method: "PATCH" }, handlerOrOptions);
  }
  return createHttpHandler({ path, method: "PATCH", ...handlerOrOptions }, maybeHandler!);
}

export function httpDelete(path: string, handler: HttpHandlerFn): FunctionHandlerDefinition;
export function httpDelete(
  path: string,
  options: HttpHandlerOptions,
  handler: HttpHandlerFn,
): FunctionHandlerDefinition;
export function httpDelete(
  path: string,
  handlerOrOptions: HttpHandlerFn | HttpHandlerOptions,
  maybeHandler?: HttpHandlerFn,
): FunctionHandlerDefinition {
  if (typeof handlerOrOptions === "function") {
    return createHttpHandler({ path, method: "DELETE" }, handlerOrOptions);
  }
  return createHttpHandler({ path, method: "DELETE", ...handlerOrOptions }, maybeHandler!);
}
