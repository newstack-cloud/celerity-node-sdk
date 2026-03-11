import type { ServiceContainer } from "@celerity-sdk/types";
import type { Cache, CacheCredentials } from "./types";
import {
  cacheToken,
  cacheCredentialsToken,
  DEFAULT_CACHE_TOKEN,
  DEFAULT_CACHE_CREDENTIALS_TOKEN,
} from "./decorators";

/**
 * Resolves a {@link Cache} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit when exactly one
 *   cache resource exists to use the default.
 *
 * @example
 * ```ts
 * const handler = createHttpHandler(async (req, ctx) => {
 *   const sessions = await getCache(ctx.container, "sessionCache");
 *   const val = await sessions.get("user:123");
 * });
 * ```
 */
export function getCache(container: ServiceContainer, resourceName?: string): Promise<Cache> {
  const token = resourceName ? cacheToken(resourceName) : DEFAULT_CACHE_TOKEN;
  return container.resolve<Cache>(token);
}

/**
 * Resolves {@link CacheCredentials} from the DI container for direct ioredis access.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit for default.
 */
export function getCacheCredentials(
  container: ServiceContainer,
  resourceName?: string,
): Promise<CacheCredentials> {
  const token = resourceName
    ? cacheCredentialsToken(resourceName)
    : DEFAULT_CACHE_CREDENTIALS_TOKEN;
  return container.resolve<CacheCredentials>(token);
}
