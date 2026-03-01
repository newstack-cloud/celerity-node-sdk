import "reflect-metadata";
import type { ModuleMetadata } from "@celerity-sdk/types";
import { MODULE_METADATA } from "../metadata/constants";

/**
 * Declares a module — the organizational unit for grouping controllers,
 * providers, function handlers, and sub-modules. The root module is the
 * entry point for bootstrapping the application.
 *
 * @param metadata - Module configuration including:
 *   - `imports` — sub-modules to compose into this module's scope
 *   - `controllers` — handler classes (`@Controller`, `@WebSocketController`, `@Consumer`, etc.)
 *   - `providers` — DI providers (classes, factories, or values)
 *   - `functionHandlers` — function-based handler definitions
 *   - `guards` — guard classes or definitions
 *   - `layers` — application-level layers applied to all handlers in this module
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [DatabaseModule],
 *   controllers: [UserController, OrderConsumer],
 *   providers: [UserService, OrderService],
 * })
 * class AppModule {}
 * ```
 */
export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_METADATA, metadata, target);
  };
}
