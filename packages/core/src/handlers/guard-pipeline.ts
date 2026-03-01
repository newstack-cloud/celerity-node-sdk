import createDebug from "debug";
import type { ServiceContainer, GuardHandlerContext, CelerityLogger } from "@celerity-sdk/types";
import { HttpException } from "../errors/http-exception";
import { HandlerMetadataStore } from "../metadata/handler-metadata";
import type { ResolvedGuard } from "./types";
import type { GuardRequest, GuardContext } from "../functions/create-guard";

const debug = createDebug("celerity:core:guard-pipeline");

export type GuardInput = {
  token: string;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: unknown;
  requestId: string;
  clientIp: string;
  auth: Record<string, unknown>;
  handlerName?: string;
};

export type GuardPipelineOptions = {
  container: ServiceContainer;
  handlerMetadata?: Record<string, unknown>;
};

export type GuardResult =
  | { allowed: true; auth: Record<string, unknown> }
  | { allowed: false; statusCode: number; message: string; details?: unknown };

/**
 * Executes a guard handler and returns a result indicating whether access
 * is allowed. On success, `auth` contains the data to store under
 * `request.auth.<guardName>`. On failure, `statusCode` and `message`
 * describe the rejection.
 */
export async function executeGuardPipeline(
  guard: ResolvedGuard,
  input: GuardInput,
  options: GuardPipelineOptions,
): Promise<GuardResult> {
  const metadata = new HandlerMetadataStore({
    ...(guard.customMetadata ?? {}),
    ...(options.handlerMetadata ?? {}),
  });

  const logger = await createGuardLogger(guard.name, input, options.container);

  try {
    const result = guard.isFunctionGuard
      ? await invokeFunctionGuard(guard, input, metadata, options, logger)
      : await invokeClassGuard(guard, input, metadata, options, logger);

    debug("guard %s — allowed", guard.name);
    return { allowed: true, auth: (result ?? {}) as Record<string, unknown> };
  } catch (error) {
    if (error instanceof HttpException) {
      debug("guard %s — rejected %d: %s", guard.name, error.statusCode, error.message);
      return {
        allowed: false,
        statusCode: error.statusCode,
        message: error.message,
        details: error.details,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    debug("guard %s — unexpected error: %s", guard.name, message);
    return { allowed: false, statusCode: 401, message: "Unauthorized" };
  }
}

async function createGuardLogger(
  guardName: string,
  input: GuardInput,
  container: ServiceContainer,
): Promise<CelerityLogger> {
  const attrs = {
    guard: guardName,
    requestId: input.requestId,
    method: input.method,
    path: input.path,
    clientIp: input.clientIp,
    ...(input.handlerName ? { handlerName: input.handlerName } : {}),
  };

  if (container.has("CelerityLogger")) {
    const root = await container.resolve<CelerityLogger>("CelerityLogger");
    return root.child("guard", attrs);
  }

  const pkg = "@celerity-sdk/telemetry";
  const { createLogger, readTelemetryEnv } = (await import(pkg)) as {
    createLogger: (config: unknown) => Promise<CelerityLogger>;
    readTelemetryEnv: () => unknown;
  };
  const rootLogger = await createLogger(readTelemetryEnv());
  return rootLogger.child("guard", attrs);
}

async function invokeClassGuard(
  guard: ResolvedGuard,
  input: GuardInput,
  metadata: HandlerMetadataStore,
  options: GuardPipelineOptions,
  logger: CelerityLogger | undefined,
): Promise<unknown> {
  const guardContext: GuardHandlerContext = {
    token: input.token,
    auth: input.auth,
    request: {
      method: input.method,
      path: input.path,
      headers: input.headers,
      query: input.query,
      cookies: input.cookies,
      body: input.body,
      requestId: input.requestId,
      clientIp: input.clientIp,
    },
    metadata,
    container: options.container,
    logger,
  };

  const paramCount = guard.handlerFn.length;
  const args: unknown[] = new Array(paramCount);
  const decorated = new Set(guard.paramMetadata.map((m) => m.index));

  for (const meta of guard.paramMetadata) {
    if (meta.type === "token") {
      args[meta.index] = guardContext.token;
    } else if (meta.type === "auth") {
      args[meta.index] = guardContext.auth;
    }
  }

  // Undecorated params receive the full GuardHandlerContext.
  for (let i = 0; i < paramCount; i++) {
    if (!decorated.has(i)) {
      args[i] = guardContext;
    }
  }

  return guard.handlerFn.apply(guard.handlerInstance, args);
}

async function invokeFunctionGuard(
  guard: ResolvedGuard,
  input: GuardInput,
  metadata: HandlerMetadataStore,
  options: GuardPipelineOptions,
  logger: CelerityLogger | undefined,
): Promise<unknown> {
  const req: GuardRequest = {
    token: input.token,
    headers: input.headers,
    query: input.query,
    cookies: input.cookies,
    body: input.body,
    requestId: input.requestId,
    clientIp: input.clientIp,
  };

  const ctx: GuardContext = {
    metadata,
    container: options.container,
    auth: input.auth,
    logger,
  };

  if (guard.injectTokens && guard.injectTokens.length > 0) {
    const deps: unknown[] = [];
    for (const token of guard.injectTokens) {
      deps.push(await options.container.resolve(token));
    }
    return guard.handlerFn(req, ctx, ...deps);
  }

  return guard.handlerFn(req, ctx);
}
