import createDebug from "debug";
import type {
  BaseHandlerContext,
  CelerityLayer,
  Type,
  ServiceContainer,
} from "@celerity-sdk/types";
import { runLayerPipeline } from "../layers/pipeline";
import { HandlerMetadataStore } from "../metadata/handler-metadata";
import { resolveHandlerInstance, type ResolvedHandlerBase } from "./types";
import type { ParamMetadata } from "../decorators/params";

const debug = createDebug("celerity:core:custom-pipeline");

export type CustomPipelineOptions = {
  container: ServiceContainer;
  systemLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  appLayers?: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  handlerName?: string;
};

/**
 * Execute a custom/invocable handler pipeline.
 *
 * Unlike consumer and schedule pipelines, custom handlers return raw results
 * and errors are re-thrown to the caller (not wrapped in `EventResult`).
 */
export async function executeCustomPipeline(
  handler: ResolvedHandlerBase,
  payload: unknown,
  options: CustomPipelineOptions,
): Promise<unknown> {
  const context: BaseHandlerContext = {
    metadata: new HandlerMetadataStore({
      ...(handler.customMetadata ?? {}),
      ...(options.handlerName ? { handlerName: options.handlerName } : {}),
      rawPayload: payload,
    }),
    container: options.container,
  };

  const allLayers = [
    ...(options.systemLayers ?? []),
    ...(options.appLayers ?? []),
    ...handler.layers,
  ];

  debug("name=%s — %d layers", options.handlerName ?? "unknown", allLayers.length);

  let result: unknown;

  await runLayerPipeline(
    allLayers,
    context,
    async () => {
      const style = handler.isFunctionHandler ? "function" : "class";
      debug("invoking %s handler", style);

      const validatedPayload: unknown = context.metadata.get("validatedPayload") ?? payload;

      if (handler.isFunctionHandler) {
        result = await invokeFunctionHandler(handler, context, validatedPayload);
      } else {
        result = await invokeClassHandler(handler, context, validatedPayload);
      }
    },
    "custom",
  );

  return result;
}

async function invokeClassHandler(
  handler: ResolvedHandlerBase,
  context: BaseHandlerContext,
  validatedPayload: unknown,
): Promise<unknown> {
  const args: unknown[] = [];
  const sorted = [...handler.paramMetadata].sort((a, b) => a.index - b.index);

  for (const meta of sorted) {
    args[meta.index] = extractCustomParam(meta, context, validatedPayload);
  }

  const instance = await resolveHandlerInstance(handler, context.container);
  return handler.handlerFn.apply(instance, args);
}

async function invokeFunctionHandler(
  handler: ResolvedHandlerBase,
  context: BaseHandlerContext,
  validatedPayload: unknown,
): Promise<unknown> {
  const deps: unknown[] = [];
  if (handler.injectTokens && handler.injectTokens.length > 0) {
    for (const token of handler.injectTokens) {
      deps.push(await context.container.resolve(token));
    }
  }

  // Function handler signature: (payload, ctx, ...deps)
  return handler.handlerFn(validatedPayload, context, ...deps);
}

function extractCustomParam(
  meta: ParamMetadata,
  context: BaseHandlerContext,
  validatedPayload: unknown,
): unknown {
  switch (meta.type) {
    case "payload":
      return validatedPayload;
    case "invokeContext":
      return context;
    default:
      return undefined;
  }
}
