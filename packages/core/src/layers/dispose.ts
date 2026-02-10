import type { CelerityLayer, Type } from "@celerity-sdk/types";

/**
 * Disposes an array of layers in reverse order.
 * Skips class references (Type<CelerityLayer>) — only instances with a
 * `dispose` method are called. Errors are non-fatal; disposal continues
 * for remaining layers.
 */
export async function disposeLayers(
  layers: (CelerityLayer | Type<CelerityLayer>)[],
): Promise<void> {
  for (const layer of [...layers].reverse()) {
    if (typeof layer === "object" && "dispose" in layer) {
      try {
        await layer.dispose?.();
      } catch {
        // Non-fatal — continue disposing remaining layers
      }
    }
  }
}
