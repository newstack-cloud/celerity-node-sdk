import "reflect-metadata";
import type { InjectionToken, Type } from "@celerity-sdk/types";
import { USE_RESOURCE_METADATA, getClassDependencyTokens } from "@celerity-sdk/core";
import type { ScannedModule } from "./metadata-app";

/**
 * Resolves the blueprint resources a handler class reaches, including those
 * reached only through the services it injects.
 *
 * Resource decorators such as `@SqlDatabase("auditDatabase")` record the
 * resource name on the class that declares the constructor parameter. That
 * class is very often a service rather than the controller, so reading the
 * controller's own metadata alone doesn't see anything, a controller injecting an
 * AuditService that injects the database has no resource metadata of its own.
 * Without the walk, the handler ends up with no link to the database, and so no
 * IAM grant, no environment wiring and no security group rule.
 */
export type ResourceRefResolver = (root: Type) => string[];

/**
 * Builds a resolver over the scanned module's provider graph.
 *
 * Granularity is the injected class, not the called method: every resource any
 * reachable provider declares is attributed to the handler. Narrowing that
 * would need call-graph analysis, and under-reporting costs a missing
 * permission at runtime, so method-level `@UseResource` on a reachable provider
 * is included for the same reason.
 */
export function createResourceRefResolver(scanned: ScannedModule): ResourceRefResolver {
  const dependenciesByToken = new Map<InjectionToken, InjectionToken[]>();
  for (const provider of scanned.providers) {
    dependenciesByToken.set(provider.token, provider.dependencies);
  }

  const cache = new Map<Type, string[]>();

  return (root: Type): string[] => {
    const cached = cache.get(root);
    if (cached) return cached;

    const refs: string[] = [];
    const seenRefs = new Set<string>();
    const visited = new Set<InjectionToken>([root]);
    // Seeded with the root's dependencies rather than the root; the root's own
    // class-level metadata is read directly by the caller, and walking its
    // methods here would give every handler on a controller the resources of
    // every other handler on it.
    const queue: InjectionToken[] = [...dependencyTokens(root, dependenciesByToken)];

    while (queue.length > 0) {
      const token = queue.shift() as InjectionToken;
      if (visited.has(token)) continue;
      visited.add(token);

      if (typeof token === "function") {
        for (const name of declaredResourceNames(token as Type)) {
          if (!seenRefs.has(name)) {
            seenRefs.add(name);
            refs.push(name);
          }
        }
      }

      queue.push(...dependencyTokens(token, dependenciesByToken));
    }

    cache.set(root, refs);
    return refs;
  };
}

/**
 * Falls back to reading the class directly when a token is not a registered
 * provider, matching how dependency validation treats implicitly constructable
 * classes.
 */
function dependencyTokens(
  token: InjectionToken,
  dependenciesByToken: Map<InjectionToken, InjectionToken[]>,
): InjectionToken[] {
  const registered = dependenciesByToken.get(token);
  if (registered) return registered;
  if (typeof token === "function") return getClassDependencyTokens(token as Type);
  return [];
}

// Class-level metadata covers constructor parameter decorators and
// `@UseResource` on the class. The prototype walk picks up `@UseResource`
// applied to individual methods.
function declaredResourceNames(providerClass: Type): string[] {
  const names: string[] = [];

  const classLevel: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, providerClass) ?? [];
  names.push(...classLevel);

  const prototype = providerClass.prototype as object | undefined;
  if (!prototype) return names;

  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (methodName === "constructor") continue;
    const methodLevel: string[] =
      Reflect.getOwnMetadata(USE_RESOURCE_METADATA, prototype, methodName) ?? [];
    names.push(...methodLevel);
  }

  return names;
}
