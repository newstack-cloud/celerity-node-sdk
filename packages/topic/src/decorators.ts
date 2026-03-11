import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import type { Topic as TopicType } from "./types";

// Re-declare as interface so the type merges with the decorator function below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Topic extends TopicType {}

export function topicToken(resourceName: string): symbol {
  return Symbol.for(`celerity:topic:${resourceName}`);
}

export const DEFAULT_TOPIC_TOKEN = Symbol.for("celerity:topic:default");

/**
 * Parameter decorator that injects a {@link Topic} instance for the given
 * blueprint resource. Writes both DI injection metadata and CLI resource-ref
 * metadata using well-known `Symbol.for()` keys (no dependency on core).
 *
 * When `resourceName` is omitted, the default topic token is used — this
 * auto-resolves when exactly one topic resource exists.
 *
 * @example
 * ```ts
 * @Controller("/orders")
 * class OrderController {
 *   constructor(@Topic("orderEvents") private events: Topic) {}
 * }
 * ```
 */
export function Topic(resourceName?: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const token = resourceName ? topicToken(resourceName) : DEFAULT_TOPIC_TOKEN;
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
