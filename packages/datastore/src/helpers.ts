import type { ServiceContainer } from "@celerity-sdk/types";
import type { Datastore } from "./types";
import { datastoreToken, DEFAULT_DATASTORE_TOKEN } from "./decorators";

/**
 * Resolves a {@link Datastore} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit when exactly one
 *   datastore resource exists to use the default.
 *
 * @example
 * ```ts
 * const handler = createHttpHandler(async (req, ctx) => {
 *   const users = await getDatastore(ctx.container, "usersTable");
 *   const user = await users.getItem({ pk: req.pathParameters.userId });
 * });
 * ```
 */
export function getDatastore(
  container: ServiceContainer,
  resourceName?: string,
): Promise<Datastore> {
  const token = resourceName ? datastoreToken(resourceName) : DEFAULT_DATASTORE_TOKEN;
  return container.resolve<Datastore>(token);
}
