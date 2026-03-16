import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import type { ConfigNamespace as ConfigNamespaceType } from "./config-service";

// Re-declare as interface so the type merges with the decorator function below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Config extends ConfigNamespaceType {}

export function configNamespaceToken(resourceName: string): symbol {
  return Symbol.for(`celerity:config:${resourceName}`);
}

/**
 * Parameter decorator that injects a {@link ConfigNamespace} for the given
 * blueprint config resource. The resource name is required — it must match
 * a `celerity/config` resource in the blueprint.
 *
 * @example
 * ```ts
 * @Controller("/health")
 * class HealthController {
 *   constructor(@Config("appConfig") private config: Config) {}
 *
 *   @Get()
 *   async check() {
 *     const appName = await this.config.get("APP_NAME");
 *     return { appName };
 *   }
 * }
 * ```
 */
export function Config(resourceName: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const token = configNamespaceToken(resourceName);
    const existing: Map<number, unknown> =
      Reflect.getOwnMetadata(INJECT_METADATA, target) ?? new Map();
    existing.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_METADATA, existing, target);

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, target) ?? [];
    if (!resources.includes(resourceName)) {
      Reflect.defineMetadata(USE_RESOURCE_METADATA, [...resources, resourceName], target);
    }
  };
}
