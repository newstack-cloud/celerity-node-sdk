/**
 * Joins a handler class prefix with a method-level path.
 * Both use the `{param}` format (matching blueprints).
 *
 * @example
 * joinHandlerPath("/orders", "/{orderId}") => "/orders/{orderId}"
 * joinHandlerPath("/", "/health") => "/health"
 * joinHandlerPath("/api/v1", "/users") => "/api/v1/users"
 */
export function joinHandlerPath(prefix: string, methodPath: string): string {
  const base = prefix || "";
  const path = `/${base}/${methodPath}`.replaceAll(/\/+/g, "/").replace(/\/$/, "") || "/";
  return path;
}
