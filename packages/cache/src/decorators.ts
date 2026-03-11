import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";

export function cacheToken(resourceName: string): symbol {
  return Symbol.for(`celerity:cache:${resourceName}`);
}

export function cacheCredentialsToken(resourceName: string): symbol {
  return Symbol.for(`celerity:cache:credentials:${resourceName}`);
}

export function cacheClientToken(resourceName: string): symbol {
  return Symbol.for(`celerity:cache:client:${resourceName}`);
}

export const DEFAULT_CACHE_TOKEN = Symbol.for("celerity:cache:default");
export const DEFAULT_CACHE_CREDENTIALS_TOKEN = Symbol.for("celerity:cache:credentials:default");

function createResourceDecorator(
  tokenFn: (name: string) => symbol,
  defaultToken: symbol,
): (resourceName?: string) => ParameterDecorator {
  return (resourceName?: string): ParameterDecorator => {
    return (target, _propertyKey, parameterIndex) => {
      const token = resourceName ? tokenFn(resourceName) : defaultToken;
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
  };
}

/**
 * Parameter decorator that injects a {@link Cache} instance for the given
 * blueprint resource. When `resourceName` is omitted, the default cache
 * token is used — this auto-resolves when exactly one cache resource exists.
 *
 * @example
 * ```ts
 * @Handler()
 * class SessionHandler {
 *   constructor(@Cache("sessionCache") private sessions: Cache) {}
 * }
 * ```
 */
export const Cache = createResourceDecorator(cacheToken, DEFAULT_CACHE_TOKEN);

/**
 * Parameter decorator that injects {@link CacheCredentials} for direct ioredis
 * access (BYO client). Provides connection info and auth credentials for
 * advanced Redis features not covered by the Cache abstraction.
 *
 * @example
 * ```ts
 * @Handler()
 * class AdvancedHandler {
 *   constructor(@CacheCredentials("sessionCache") private creds: CacheCredentials) {}
 * }
 * ```
 */
export const CacheCredentials = createResourceDecorator(
  cacheCredentialsToken,
  DEFAULT_CACHE_CREDENTIALS_TOKEN,
);
