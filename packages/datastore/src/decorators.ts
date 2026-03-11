import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import type { Datastore as DatastoreType } from "./types";

// Re-declare as interface so the type merges with the decorator function below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Datastore extends DatastoreType {}

export function datastoreToken(resourceName: string): symbol {
  return Symbol.for(`celerity:datastore:${resourceName}`);
}

export const DEFAULT_DATASTORE_TOKEN = Symbol.for("celerity:datastore:default");

/**
 * Parameter decorator that injects a {@link Datastore} instance for the given
 * blueprint resource. Writes both DI injection metadata and CLI resource-ref
 * metadata using well-known `Symbol.for()` keys (no dependency on core).
 *
 * When `resourceName` is omitted, the default datastore token is used — this
 * auto-resolves when exactly one datastore resource exists.
 *
 * @example
 * ```ts
 * @Controller("/users")
 * class UserController {
 *   constructor(@Datastore("usersTable") private users: Datastore) {}
 * }
 * ```
 */
export function Datastore(resourceName?: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const token = resourceName ? datastoreToken(resourceName) : DEFAULT_DATASTORE_TOKEN;
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
