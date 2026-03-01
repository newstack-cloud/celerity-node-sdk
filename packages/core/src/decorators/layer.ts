import "reflect-metadata";
import type { Type, CelerityLayer } from "@celerity-sdk/types";
import { LAYER_METADATA } from "../metadata/constants";

/**
 * Attaches one or more layers to a controller class or individual method.
 * Layers run in declaration order (top-to-bottom) as middleware around the
 * handler, composing into the pipeline: `[system] → [app] → [handler layers]`.
 *
 * Can be applied at class level (all methods) or method level. Class-level
 * layers run before method-level layers. Accepts both layer instances and
 * layer classes (which are resolved from the DI container).
 *
 * @param layers - Layer instances or layer class constructors to attach.
 *
 * @example
 * ```ts
 * @Controller("/orders")
 * @UseLayer(LoggingLayer, AuthLayer)
 * class OrderController {
 *   @Get("/{id}")
 *   @UseLayer(new CacheLayer({ ttl: 60 }))
 *   async getOrder(@Param("id") id: string) { ... }
 * }
 * ```
 */
export function UseLayer(...layers: (Type<CelerityLayer> | CelerityLayer)[]) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: (Type<CelerityLayer> | CelerityLayer)[] =
        Reflect.getOwnMetadata(LAYER_METADATA, target, propertyKey) ?? [];
      Reflect.defineMetadata(LAYER_METADATA, [...layers, ...existing], target, propertyKey);
    } else {
      const existing: (Type<CelerityLayer> | CelerityLayer)[] =
        Reflect.getOwnMetadata(LAYER_METADATA, target) ?? [];
      Reflect.defineMetadata(LAYER_METADATA, [...layers, ...existing], target);
    }
  };
}

/**
 * Array-based variant of `@UseLayer()`. Accepts layers as an array instead
 * of rest parameters — useful when layers are composed programmatically.
 */
export function UseLayers(layers: (Type<CelerityLayer> | CelerityLayer)[]) {
  return UseLayer(...layers);
}
