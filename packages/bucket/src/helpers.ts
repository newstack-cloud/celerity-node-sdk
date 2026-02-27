import type { ServiceContainer } from "@celerity-sdk/types";
import type { Bucket } from "./types";
import { bucketToken, DEFAULT_BUCKET_TOKEN } from "./decorators";

/**
 * Resolves a {@link Bucket} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit when exactly one
 *   bucket resource exists to use the default.
 *
 * @example
 * ```ts
 * const handler = createHttpHandler(async (req, ctx) => {
 *   const images = await getBucket(ctx.container, "imagesBucket");
 *   await images.put("photo.jpg", body);
 * });
 * ```
 */
export function getBucket(container: ServiceContainer, resourceName?: string): Promise<Bucket> {
  const token = resourceName ? bucketToken(resourceName) : DEFAULT_BUCKET_TOKEN;
  return container.resolve<Bucket>(token);
}
