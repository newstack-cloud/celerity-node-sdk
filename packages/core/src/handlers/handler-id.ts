import type { Type } from "@celerity-sdk/types";

/**
 * The identifier a class-based handler is registered under.
 *
 * Deployment tooling identifies a handler as `<module>.<Class>.<method>`, for example
 * `app-module.UsersController.listUsers`, and passes that to the runtime. The scanners
 * cannot produce the `<module>` segment: they walk a module graph of classes and never
 * see the file the root module came from. So a handler is registered under the part
 * they can know, and {@link stripModulePrefix} reconciles the two at lookup time.
 */
export function classHandlerId(controllerClass: Type, methodName: string): string {
  return `${controllerClass.name}.${methodName}`;
}

/**
 * Reduces a deployment-supplied handler id to the `<Class>.<method>` form the scanners
 * register, by dropping any leading module segments.
 *
 * Returns undefined when there is nothing to strip, so a caller can tell "already in
 * registered form, and it did not match" from "worth retrying in reduced form".
 */
export function stripModulePrefix(handlerId: string): string | undefined {
  const segments = handlerId.split(".");
  if (segments.length <= 2) return undefined;
  return segments.slice(-2).join(".");
}
