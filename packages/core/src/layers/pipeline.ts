import createDebug from "debug";
import type { CelerityLayer, HandlerContext, HandlerResponse, Type } from "@celerity-sdk/types";

const debug = createDebug("celerity:core:layers");

export function runLayerPipeline(
  layers: (CelerityLayer | Type<CelerityLayer>)[],
  context: HandlerContext,
  handler: () => Promise<HandlerResponse>,
): Promise<HandlerResponse> {
  const resolved = layers.map((layer) => (typeof layer === "function" ? new layer() : layer));
  debug("runLayerPipeline: %d layers", resolved.length);

  let index = -1;

  function dispatch(i: number): Promise<HandlerResponse> {
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
