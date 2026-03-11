import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import type { Queue as QueueType } from "./types";

// Re-declare as interface so the type merges with the decorator function below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Queue extends QueueType {}

export function queueToken(resourceName: string): symbol {
  return Symbol.for(`celerity:queue:${resourceName}`);
}

export const DEFAULT_QUEUE_TOKEN = Symbol.for("celerity:queue:default");

/**
 * Parameter decorator that injects a {@link Queue} instance for the given
 * blueprint resource. Writes both DI injection metadata and CLI resource-ref
 * metadata using well-known `Symbol.for()` keys (no dependency on core).
 *
 * When `resourceName` is omitted, the default queue token is used — this
 * auto-resolves when exactly one queue resource exists.
 *
 * @example
 * ```ts
 * @Controller("/orders")
 * class OrderController {
 *   constructor(@Queue("ordersQueue") private orders: Queue) {}
 * }
 * ```
 */
export function Queue(resourceName?: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const token = resourceName ? queueToken(resourceName) : DEFAULT_QUEUE_TOKEN;
    const existing: Map<number, unknown> =
      Reflect.getOwnMetadata(INJECT_METADATA, target) ?? new Map();
    existing.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_METADATA, existing, target);

    if (resourceName) {
      const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, target) ?? [];
      if (!resources.includes(resourceName)) {
        Reflect.defineMetadata(USE_RESOURCE_METADATA, [...resources, resourceName], target);
      }
    }
  };
}
