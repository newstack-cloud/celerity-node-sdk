import createDebug from "debug";
import type {
  ScheduleEventInput,
  ScheduleHandlerContext,
  EventResult,
  BaseHandlerContext,
  CelerityLayer,
  Type,
  ServiceContainer,
} from "@celerity-sdk/types";
import { runLayerPipeline } from "../layers/pipeline";
import { HandlerMetadataStore } from "../metadata/handler-metadata";
import { resolveHandlerInstance, type ResolvedHandlerBase } from "./types";
import type { ParamMetadata } from "../decorators/params";

const debug = createDebug("celerity:core:schedule-pipeline");

export type SchedulePipelineOptions = {
  container: ServiceContainer;
  systemLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  appLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  handlerName?: string;
};

export async function executeSchedulePipeline(
  handler: ResolvedHandlerBase,
  event: ScheduleEventInput,
  options: SchedulePipelineOptions,
): Promise<EventResult> {
  const context: ScheduleHandlerContext = {
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

  debug("tag=%s — %d layers", event.handlerTag, allLayers.length);

  let result: EventResult = { success: true };

  try {
    await runLayerPipeline(
      allLayers,
      context,
      async () => {
        const style = handler.isFunctionHandler ? "function" : "class";
        debug("invoking %s handler", style);

        const validatedInput: unknown = context.metadata.get("validatedInput") ?? event.input;

        if (handler.isFunctionHandler) {
          result = await invokeFunctionHandler(handler, context, validatedInput);
        } else {
          result = await invokeClassHandler(handler, context, validatedInput);
        }
      },
      "schedule",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (context.logger) {
      context.logger.error("Unhandled error in schedule handler pipeline", {
        error: errorMessage,
        handlerTag: event.handlerTag,
        scheduleId: event.scheduleId,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
        ...(error instanceof Error && error.cause ? { cause: String(error.cause) } : {}),
      });
    } else {
      console.error("Unhandled error in schedule handler pipeline:", error);
    }
    return { success: false, errorMessage };
  }

  return result;
}

async function invokeClassHandler(
  handler: ResolvedHandlerBase,
  context: ScheduleHandlerContext,
  validatedInput: unknown,
): Promise<EventResult> {
  const args: unknown[] = [];
  const sorted = [...handler.paramMetadata].sort((a, b) => a.index - b.index);

  for (const meta of sorted) {
    args[meta.index] = extractScheduleParam(meta, context, validatedInput);
  }

  const instance = await resolveHandlerInstance(handler, context.container);
  return (await handler.handlerFn.apply(instance, args)) as EventResult;
}

async function invokeFunctionHandler(
  handler: ResolvedHandlerBase,
  context: ScheduleHandlerContext,
  _validatedInput: unknown,
): Promise<EventResult> {
  const deps: unknown[] = [];
  if (handler.injectTokens && handler.injectTokens.length > 0) {
    for (const token of handler.injectTokens) {
      deps.push(await context.container.resolve(token));
    }
  }

  // Function handler signature: (event: ScheduleEventInput, ctx, ...deps)
  return (await handler.handlerFn(context.event, context, ...deps)) as EventResult;
}

function extractScheduleParam(
  meta: ParamMetadata,
  context: ScheduleHandlerContext,
  validatedInput: unknown,
): unknown {
  switch (meta.type) {
    case "scheduleInput":
      return validatedInput;
    case "scheduleId":
      return context.event.scheduleId;
    case "scheduleExpression":
      return context.event.schedule;
    case "scheduleEvent":
      return context.event;
    default:
      return undefined;
  }
}
