import createDebug from "debug";
import type { BaseHandlerContext, CelerityLayer, HandlerType, Type } from "@celerity-sdk/types";

const debug = createDebug("celerity:core:layers");

export function runLayerPipeline<TContext extends BaseHandlerContext>(
  layers: (CelerityLayer<TContext> | Type<CelerityLayer<TContext>>)[],
  context: TContext,
  handler: () => Promise<unknown>,
  handlerType?: HandlerType,
): Promise<unknown> {
  const resolved = layers
    .map((layer) => (typeof layer === "function" ? new layer() : layer))
    .filter((layer) => !handlerType || !layer.supports || layer.supports(handlerType));
  debug("runLayerPipeline: %d layers (handlerType=%s)", resolved.length, handlerType ?? "all");

  let index = -1;

  function dispatch(i: number): Promise<unknown> {
    if (i <= index) {
      return Promise.reject(new Error("next() called multiple times"));
    }
    index = i;

    if (i >= resolved.length) {
      return handler();
    }

    const current = resolved[i];
    debug("layer[%d] %s", i, current.constructor.name);
    return current.handle(context, () => dispatch(i + 1));
  }

  return dispatch(0);
}
