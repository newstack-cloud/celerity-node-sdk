import "reflect-metadata";
import {
  GUARD_PROTECTEDBY_METADATA,
  GUARD_CUSTOM_METADATA,
  PUBLIC_METADATA,
} from "../metadata/constants";

/**
 * Marks a handler class as a custom guard implementation.
 * The handler IS the guard — in serverless it becomes a Lambda Authorizer,
 * in containers the Rust runtime invokes it before protected handlers.
 *
 * Other handlers reference this guard via `@ProtectedBy("name")`.
 */
export function Guard(name: string): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(GUARD_CUSTOM_METADATA, name, target);
  };
}

/**
 * Declares that a handler or method is protected by one or more named guards.
 * Multiple `@ProtectedBy` decorators accumulate in declaration order (top-to-bottom).
 *
 * Can be applied at class level (all methods) or method level.
 */
export function ProtectedBy(name: string) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: string[] =
        Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, target, propertyKey) ?? [];
      // Prepend: decorators apply bottom-up, so prepending gives declaration order
      Reflect.defineMetadata(GUARD_PROTECTEDBY_METADATA, [name, ...existing], target, propertyKey);
    } else {
      const existing: string[] = Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, target) ?? [];
      Reflect.defineMetadata(GUARD_PROTECTEDBY_METADATA, [name, ...existing], target);
    }
  };
}

/**
 * Marks a method as public, opting out of the default guard.
 */
export function Public(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(PUBLIC_METADATA, true, target, propertyKey);
    return descriptor;
  };
}
