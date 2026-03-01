import createDebug from "debug";
import type {
  ConsumerEventInput,
  ConsumerHandlerContext,
  ConsumerMessage,
  EventResult,
  MessageProcessingFailure,
  ValidatedConsumerMessage,
  BaseHandlerContext,
  CelerityLayer,
  Type,
  ServiceContainer,
} from "@celerity-sdk/types";
import { runLayerPipeline } from "../layers/pipeline";
import { HandlerMetadataStore } from "../metadata/handler-metadata";
import type { ResolvedHandlerBase } from "./types";
import type { ParamMetadata } from "../decorators/params";

const debug = createDebug("celerity:core:consumer-pipeline");

export type ConsumerPipelineOptions = {
  container: ServiceContainer;
  systemLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  appLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  handlerName?: string;
};

export async function executeConsumerPipeline(
  handler: ResolvedHandlerBase,
  event: ConsumerEventInput,
  options: ConsumerPipelineOptions,
): Promise<EventResult> {
  const context: ConsumerHandlerContext = {
    event,
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

  debug(
    "tag=%s — %d messages, %d layers",
    event.handlerTag,
    event.messages.length,
    allLayers.length,
  );

  let result: EventResult = { success: true };

  try {
    await runLayerPipeline(
      allLayers,
      context,
      async () => {
        const style = handler.isFunctionHandler ? "function" : "class";
        debug("invoking %s handler", style);

        const validatedMessages =
          context.metadata.get<ValidatedConsumerMessage<unknown>[]>("validatedMessages");
        const validationFailures =
          context.metadata.get<MessageProcessingFailure[]>("validationFailures") ?? [];
        const rawMessages = validatedMessages ? undefined : event.messages;

        if (handler.isFunctionHandler) {
          result = await invokeFunctionHandler(handler, context, validatedMessages, rawMessages);
        } else {
          result = await invokeClassHandler(handler, context, validatedMessages, rawMessages);
        }

        if (validationFailures.length > 0) {
          const existing = result.failures ?? [];
          result = {
            ...result,
            success: result.success && validationFailures.length === 0,
            failures: [...validationFailures, ...existing],
          };
        }
      },
      "consumer",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (context.logger) {
      context.logger.error("Unhandled error in consumer handler pipeline", {
        error: errorMessage,
        handlerTag: event.handlerTag,
        messageCount: event.messages.length,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      });
    } else {
      console.error("Unhandled error in consumer handler pipeline:", error);
    }
    return { success: false, errorMessage };
  }

  return result;
}

async function invokeClassHandler(
  handler: ResolvedHandlerBase,
  context: ConsumerHandlerContext,
  validatedMessages?: ValidatedConsumerMessage<unknown>[],
  rawMessages?: ConsumerMessage[],
): Promise<EventResult> {
  const args: unknown[] = [];
  const sorted = [...handler.paramMetadata].sort((a, b) => a.index - b.index);

  for (const meta of sorted) {
    args[meta.index] = extractConsumerParam(meta, context, validatedMessages, rawMessages);
  }

  return (await handler.handlerFn.apply(handler.handlerInstance, args)) as EventResult;
}

async function invokeFunctionHandler(
  handler: ResolvedHandlerBase,
  context: ConsumerHandlerContext,
  validatedMessages?: ValidatedConsumerMessage<unknown>[],
  _rawMessages?: ConsumerMessage[],
): Promise<EventResult> {
  const deps: unknown[] = [];
  if (handler.injectTokens && handler.injectTokens.length > 0) {
    for (const token of handler.injectTokens) {
      deps.push(await context.container.resolve(token));
    }
  }

  // With schema: (messages: ValidatedConsumerMessage<T>[], ctx, ...deps)
  // Without schema: (event: ConsumerEventInput, ctx, ...deps)
  const firstArg = validatedMessages ?? context.event;
  return (await handler.handlerFn(firstArg, context, ...deps)) as EventResult;
}

function extractConsumerParam(
  meta: ParamMetadata,
  context: ConsumerHandlerContext,
  validatedMessages?: ValidatedConsumerMessage<unknown>[],
  rawMessages?: ConsumerMessage[],
): unknown {
  switch (meta.type) {
    case "messages":
      return validatedMessages ?? rawMessages ?? context.event.messages;
    case "consumerEvent":
      return context.event;
    case "consumerVendor":
      return context.event.vendor;
    case "consumerTraceContext":
      return context.event.traceContext ?? null;
    default:
      return undefined;
  }
}
