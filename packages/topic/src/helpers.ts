import type { ServiceContainer } from "@celerity-sdk/types";
import type { Topic } from "./types";
import { topicToken, DEFAULT_TOPIC_TOKEN } from "./decorators";

/**
 * Resolves a {@link Topic} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit when exactly one
 *   topic resource exists to use the default.
 *
 * @example
 * ```ts
 * const handler = createHttpHandler(async (req, ctx) => {
 *   const events = await getTopic(ctx.container, "orderEvents");
 *   await events.publish({ orderId: "123", action: "created" });
 * });
 * ```
 */
export function getTopic(container: ServiceContainer, resourceName?: string): Promise<Topic> {
  const token = resourceName ? topicToken(resourceName) : DEFAULT_TOPIC_TOKEN;
  return container.resolve<Topic>(token);
}
