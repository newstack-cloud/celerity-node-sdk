import type {
  HttpRequest,
  HttpResponse,
  HandlerContext,
  CelerityLayer,
  Type,
  ServiceContainer,
  InjectionToken,
} from "@celerity-sdk/types";
import { runLayerPipeline } from "../layers/pipeline";
import { HttpException } from "../errors/http-exception";
import { extractParam, type ParamMetadata, type ParamType } from "../decorators/params";
import { buildHttpRequest, buildHttpContext } from "../functions/context";
import { HandlerMetadataStore } from "../metadata/handler-metadata";

export type ResolvedHandler = {
  path?: string;
  method?: string;
  protectedBy: string[];
  layers: (CelerityLayer | Type<CelerityLayer>)[];
  isPublic: boolean;
  paramMetadata: ParamMetadata[];
  customMetadata: Record<string, unknown>;
  handlerFn: (...args: unknown[]) => unknown;
  handlerInstance?: object;
  isFunctionHandler?: boolean;
  injectTokens?: InjectionToken[];
};

export type PipelineOptions = {
  container: ServiceContainer;
  systemLayers?: (CelerityLayer | Type<CelerityLayer>)[];
  appLayers?: (CelerityLayer | Type<CelerityLayer>)[];
};

export async function executeHandlerPipeline(
  handler: ResolvedHandler,
  request: HttpRequest,
  options: PipelineOptions,
): Promise<HttpResponse> {
  const context: HandlerContext = {
    request,
    metadata: new HandlerMetadataStore(handler.customMetadata ?? {}),
    container: options.container,
  };

  const allLayers = [
    ...(options.systemLayers ?? []),
    ...(options.appLayers ?? []),
    ...handler.layers,
  ];

  try {
    const response = await runLayerPipeline(allLayers, context, async () => {
      const result = handler.isFunctionHandler
        ? await invokeFunctionHandler(handler, context)
        : await invokeClassHandler(handler, context);
      return normalizeResponse(result);
    });

    return response;
  } catch (error) {
    if (error instanceof HttpException) {
      return {
        status: error.statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        }),
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (context.logger) {
      context.logger.error("Unhandled error in handler pipeline", {
        error: message,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      });
    } else {
      console.error("Unhandled error in handler pipeline:", error);
    }

    return {
      status: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
}

async function invokeClassHandler(
  handler: ResolvedHandler,
  context: HandlerContext,
): Promise<unknown> {
  const args: unknown[] = [];
  const sorted = [...handler.paramMetadata].sort((a, b) => a.index - b.index);

  for (const meta of sorted) {
    args[meta.index] = extractValidatedParam(
      meta.type,
      meta.key,
      context.request,
      context.metadata,
    );
  }

  return handler.handlerFn.apply(handler.handlerInstance, args);
}

const VALIDATED_METADATA_KEYS: Partial<Record<ParamType, string>> = {
  body: "validatedBody",
  query: "validatedQuery",
  param: "validatedParams",
  headers: "validatedHeaders",
};

function extractValidatedParam(
  type: ParamType,
  key: string | undefined,
  request: HttpRequest,
  metadata: HandlerContext["metadata"],
): unknown {
  const metaKey = VALIDATED_METADATA_KEYS[type];
  if (metaKey) {
    const validated = metadata.get(metaKey);
    if (validated !== undefined) {
      if (key && typeof validated === "object" && validated !== null) {
        return (validated as Record<string, unknown>)[key];
      }
      return validated;
    }
  }
  return extractParam(type, key, request);
}

async function invokeFunctionHandler(
  handler: ResolvedHandler,
  context: HandlerContext,
): Promise<unknown> {
  const req = buildHttpRequest(context.request, context.metadata);
  const ctx = buildHttpContext(
    context.request,
    context.metadata,
    context.container,
    context.logger,
  );

  if (handler.injectTokens && handler.injectTokens.length > 0) {
    const deps: unknown[] = [];
    for (const token of handler.injectTokens) {
      deps.push(await context.container.resolve(token));
    }
    return handler.handlerFn(req, ctx, ...deps);
  }

  return handler.handlerFn(req, ctx);
}

function normalizeResponse(result: unknown): HttpResponse {
  if (isHttpResponse(result)) {
    return result;
  }

  if (result === undefined || result === null) {
    return { status: 204 };
  }

  const body = typeof result === "string" ? result : JSON.stringify(result);
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body,
  };
}

function isHttpResponse(value: unknown): value is HttpResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as HttpResponse).status === "number"
  );
}
