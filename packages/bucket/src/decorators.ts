import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import type { Bucket as BucketType } from "./types";

// Re-declare as interface so the type merges with the decorator function below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Bucket extends BucketType {}

export function bucketToken(resourceName: string): symbol {
  return Symbol.for(`celerity:bucket:${resourceName}`);
}

export const DEFAULT_BUCKET_TOKEN = Symbol.for("celerity:bucket:default");

/**
 * Parameter decorator that injects a {@link Bucket} instance for the given
 * blueprint resource. Writes both DI injection metadata and CLI resource-ref
 * metadata using well-known `Symbol.for()` keys (no dependency on core).
 *
 * When `resourceName` is omitted, the default bucket token is used — this
 * auto-resolves when exactly one bucket resource exists.
 *
 * @example
 * ```ts
 * @Controller("/images")
 * class ImageController {
 *   constructor(@Bucket("imagesBucket") private images: Bucket) {}
 * }
 * ```
 */
export function Bucket(resourceName?: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const token = resourceName ? bucketToken(resourceName) : DEFAULT_BUCKET_TOKEN;
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
