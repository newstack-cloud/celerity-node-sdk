import type { ServiceContainer } from "@celerity-sdk/types";
import type { Queue } from "./types";
import { queueToken, DEFAULT_QUEUE_TOKEN } from "./decorators";

/**
 * Resolves a {@link Queue} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit when exactly one
 *   queue resource exists to use the default.
 *
 * @example
 * ```ts
 * const handler = createHttpHandler(async (req, ctx) => {
 *   const orders = await getQueue(ctx.container, "ordersQueue");
 *   await orders.sendMessage({ orderId: "123", action: "process" });
 * });
 * ```
 */
export function getQueue(container: ServiceContainer, resourceName?: string): Promise<Queue> {
  const token = resourceName ? queueToken(resourceName) : DEFAULT_QUEUE_TOKEN;
  return container.resolve<Queue>(token);
}
