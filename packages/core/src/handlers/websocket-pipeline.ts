import createDebug from "debug";
import type {
  WebSocketMessage,
  WebSocketHandlerContext,
  BaseHandlerContext,
  CelerityLayer,
  Type,
  ServiceContainer,
} from "@celerity-sdk/types";
import { runLayerPipeline } from "../layers/pipeline";
import { HandlerMetadataStore } from "../metadata/handler-metadata";
import type { ResolvedHandlerBase } from "./types";
import type { ParamMetadata } from "../decorators/params";

const debug = createDebug("celerity:core:ws-pipeline");

export type WebSocketPipelineOptions = {
  container: ServiceContainer;
  systemLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  appLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  handlerName?: string;
};

export async function executeWebSocketPipeline(
  handler: ResolvedHandlerBase,
  message: WebSocketMessage,
  options: WebSocketPipelineOptions,
): Promise<void> {
  const context: WebSocketHandlerContext = {
    message,
    metadata: new HandlerMetadataStore({
      ...(handler.customMetadata ?? {}),
      ...(options.handlerName ? { handlerName: options.handlerName } : {}),
    }),
    container: options.container,
  };

  const allLayers = [
    ...(options.systemLayers ?? []),
    ...(options.appLayers ?? []),
    ...handler.layers,
  ];

  debug("%s %s — %d layers", message.eventType, message.connectionId, allLayers.length);

  try {
    await runLayerPipeline(
      allLayers,
      context,
      async () => {
        const style = handler.isFunctionHandler ? "function" : "class";
        debug("invoking %s handler", style);
        if (handler.isFunctionHandler) {
          await invokeFunctionHandler(handler, context);
        } else {
          await invokeClassHandler(handler, context);
        }
      },
      "websocket",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (context.logger) {
      context.logger.error("Unhandled error in WebSocket handler pipeline", {
        error: errorMessage,
        connectionId: message.connectionId,
        eventType: message.eventType,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      });
    } else {
      console.error("Unhandled error in WebSocket handler pipeline:", error);
    }
  }
}

async function invokeClassHandler(
  handler: ResolvedHandlerBase,
  context: WebSocketHandlerContext,
): Promise<void> {
  const args: unknown[] = [];
  const sorted = [...handler.paramMetadata].sort((a, b) => a.index - b.index);

  for (const meta of sorted) {
    args[meta.index] = extractWebSocketParam(meta, context);
  }

  await handler.handlerFn.apply(handler.handlerInstance, args);
}

async function invokeFunctionHandler(
  handler: ResolvedHandlerBase,
  context: WebSocketHandlerContext,
): Promise<void> {
  const validatedBody = context.metadata.get("validatedMessageBody");
  const message =
    validatedBody !== undefined ? { ...context.message, jsonBody: validatedBody } : context.message;

  if (handler.injectTokens && handler.injectTokens.length > 0) {
    const deps: unknown[] = [];
    for (const token of handler.injectTokens) {
      deps.push(await context.container.resolve(token));
    }
    await handler.handlerFn(message, context, ...deps);
  } else {
    await handler.handlerFn(message, context);
  }
}

function extractWebSocketParam(meta: ParamMetadata, context: WebSocketHandlerContext): unknown {
  const { message } = context;
  switch (meta.type) {
    case "connectionId":
      return message.connectionId;
    case "messageBody": {
      const validated = context.metadata.get("validatedMessageBody");
      if (validated !== undefined) return validated;
      return message.jsonBody;
    }
    case "messageId":
      return message.messageId;
    case "requestContext":
      return message.requestContext;
    case "eventType":
      return message.eventType;
    default:
      return undefined;
  }
}
