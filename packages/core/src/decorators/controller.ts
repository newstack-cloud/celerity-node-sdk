import "reflect-metadata";
import { CONTROLLER_METADATA, INJECTABLE_METADATA } from "../metadata/constants";

export type ControllerMetadata = {
  prefix?: string;
};

/**
 * Marks a class as a controller — the general-purpose class decorator for
 * handler classes. The class becomes injectable and its decorated methods are
 * registered as handler callbacks. A single controller can mix handler types:
 *
 * - **HTTP handlers** — `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()`,
 *   `@Head()`, `@Options()` method decorators define HTTP routes.
 * - **Schedule handlers** — `@ScheduleHandler()` is a cross-cutting method
 *   decorator that works on any controller type, including `@Controller`.
 * - **Custom / invocable handlers** — `@Invoke("name")` registers a method as
 *   a programmatically invocable endpoint.
 *
 * @param prefix - Optional path prefix prepended to all HTTP route paths
 *   defined by method decorators within this controller. Uses `{param}` format
 *   for path parameters (matching blueprint conventions, not Express `:param`).
 *   Has no effect on schedule or invocable handler methods.
 *
 * @example
 * ```ts
 * // HTTP controller
 * @Controller("/users")
 * class UserController {
 *   @Get("/{id}")
 *   async getUser(@Param("id") id: string): Promise<HandlerResponse> { ... }
 * }
 *
 * // Schedule-only controller
 * @Controller()
 * class MaintenanceTasks {
 *   @ScheduleHandler("daily-cleanup")
 *   async cleanup(): Promise<EventResult> { ... }
 * }
 *
 * // Mixed: HTTP routes + scheduled tasks + invocable methods
 * @Controller("/admin")
 * class AdminController {
 *   @Get("/reports")
 *   async listReports(): Promise<HandlerResponse> { ... }
 *
 *   @ScheduleHandler("weekly-report")
 *   async generateWeeklyReport(): Promise<EventResult> { ... }
 *
 *   @Invoke("reprocessOrders")
 *   async reprocess(@Payload() payload: unknown): Promise<unknown> { ... }
 * }
 * ```
 */
export function Controller(prefix?: string): ClassDecorator {
  return (target) => {
    const metadata: ControllerMetadata = {};
    if (prefix !== undefined) {
      metadata.prefix = prefix;
    }
    Reflect.defineMetadata(CONTROLLER_METADATA, metadata, target);
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}
