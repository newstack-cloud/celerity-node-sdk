import "reflect-metadata";
import { CUSTOM_METADATA } from "../metadata/constants";

/**
 * Attaches custom key-value metadata to a controller class or method.
 * Metadata is accessible to guards and layers via
 * `context.metadata.get(key)` at runtime.
 *
 * Multiple `@SetMetadata` decorators accumulate on the same target.
 * Method-level metadata is merged with (and overrides) class-level metadata.
 *
 * @param key - Metadata key.
 * @param value - Metadata value (any serializable type).
 *
 * @example
 * ```ts
 * @Controller("/admin")
 * @SetMetadata("roles", ["admin"])
 * class AdminController {
 *   @Get("/")
 *   @SetMetadata("action", "admin:list")
 *   async list() { ... }
 * }
 * ```
 */
export function SetMetadata(key: string, value: unknown) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: Record<string, unknown> =
        Reflect.getOwnMetadata(CUSTOM_METADATA, target, propertyKey) ?? {};
      Reflect.defineMetadata(CUSTOM_METADATA, { ...existing, [key]: value }, target, propertyKey);
    } else {
      const existing: Record<string, unknown> =
        Reflect.getOwnMetadata(CUSTOM_METADATA, target) ?? {};
      Reflect.defineMetadata(CUSTOM_METADATA, { ...existing, [key]: value }, target);
    }
  };
}

/**
 * Shorthand for `@SetMetadata("action", value)`. Sets the `action` metadata
 * key, commonly used by guards to determine authorization rules.
 */
export function Action(value: unknown) {
  return SetMetadata("action", value);
}
