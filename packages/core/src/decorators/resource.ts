import "reflect-metadata";
import { USE_RESOURCE_METADATA } from "../metadata/constants";

/**
 * Declares that a handler or controller uses one or more blueprint-defined
 * infrastructure resources. Used by the CLI extraction pipeline to emit
 * `celerity.handler.resource.ref` annotations for handler-to-resource linking.
 *
 * When there is only one resource of a given type in the blueprint, the Go CLI
 * can auto-link via DI inference. `@UseResource` is needed to disambiguate
 * when multiple resources of the same type exist.
 *
 * Can be applied at class level (default for all methods) or method level
 * (additional resources for that handler). Multiple decorators accumulate.
 *
 * @param resourceNames - One or more blueprint resource names.
 *
 * @example
 * ```ts
 * @Controller("/orders")
 * @UseResource("ordersBucket")
 * class OrderController {
 *   @Get("/{id}")
 *   @UseResource("ordersCache")
 *   async getOrder(@Param("id") id: string) { ... }
 *
 *   @Post("/")
 *   async createOrder(@Body() body: CreateOrderDto) { ... }
 * }
 * ```
 */
export function UseResource(...resourceNames: string[]) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: string[] =
        Reflect.getOwnMetadata(USE_RESOURCE_METADATA, target, propertyKey) ?? [];
      Reflect.defineMetadata(
        USE_RESOURCE_METADATA,
        [...resourceNames, ...existing],
        target,
        propertyKey,
      );
    } else {
      const existing: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, target) ?? [];
      Reflect.defineMetadata(USE_RESOURCE_METADATA, [...resourceNames, ...existing], target);
    }
  };
}

/**
 * Array-based variant of `@UseResource()`. Accepts resource names as an array
 * instead of rest parameters — useful when resource names are composed
 * programmatically.
 */
export function UseResources(resourceNames: string[]) {
  return UseResource(...resourceNames);
}
