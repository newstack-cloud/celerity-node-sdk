import "reflect-metadata";
import createDebug from "debug";
import type {
  Type,
  InjectionToken,
  Provider,
  FunctionHandlerDefinition,
} from "@celerity-sdk/types";
import {
  buildModuleGraph,
  getClassDependencyTokens,
  getProviderDependencyTokens,
} from "@celerity-sdk/core";
import type { ModuleGraph } from "@celerity-sdk/core";

const debug = createDebug("celerity:cli");

export type ScannedProvider = {
  token: InjectionToken;
  providerType: "class" | "factory" | "value";
  dependencies: InjectionToken[];
};

export type ScannedModule = {
  controllerClasses: Type[];
  functionHandlers: FunctionHandlerDefinition[];
  providers: ScannedProvider[];
};

function scanProvider(
  provider: Type | (Provider & { provide: InjectionToken }),
  seenTokens: Set<InjectionToken>,
): ScannedProvider | null {
  if (typeof provider === "function") {
    if (seenTokens.has(provider)) return null;
    seenTokens.add(provider);
    return {
      token: provider,
      providerType: "class",
      dependencies: getClassDependencyTokens(provider),
    };
  }

  const typed = provider as Provider & { provide: InjectionToken };
  if (seenTokens.has(typed.provide)) return null;
  seenTokens.add(typed.provide);

  return {
    token: typed.provide,
    providerType: "useFactory" in typed ? "factory" : "useClass" in typed ? "class" : "value",
    dependencies: getProviderDependencyTokens(typed),
  };
}

/**
 * Builds a scanned module from the root module class using the shared
 * `buildModuleGraph` from core. Collects all handler classes, function
 * handler definitions, and provider dependency information without
 * instantiating anything.
 *
 * Inherits circular import detection from the shared graph builder.
 */
export function buildScannedModule(rootModule: Type): ScannedModule {
  const graph: ModuleGraph = buildModuleGraph(rootModule);
  const controllerClasses: Type[] = [];
  const functionHandlers: FunctionHandlerDefinition[] = [];
  const providers: ScannedProvider[] = [];
  const seenTokens = new Set<InjectionToken>();

  for (const [moduleClass, node] of graph) {
    debug(
      "scan: module %s — %d providers, %d controllers",
      moduleClass.name,
      node.providers.length,
      node.controllers.length,
    );
    for (const provider of node.providers) {
      const scanned = scanProvider(provider, seenTokens);
      if (scanned) providers.push(scanned);
    }

    for (const controller of node.controllers) {
      controllerClasses.push(controller);
      if (!seenTokens.has(controller)) {
        seenTokens.add(controller);
        providers.push({
          token: controller,
          providerType: "class",
          dependencies: getClassDependencyTokens(controller),
        });
      }
    }

    functionHandlers.push(...node.functionHandlers);
  }

  return { controllerClasses, functionHandlers, providers };
}

export type DependencyDiagnostic = {
  consumer: string;
  dependency: string;
};

/**
 * Validates that all scanned providers have resolvable dependencies.
 * Returns an array of diagnostics for each unresolvable dependency.
 * A token is resolvable if it's registered or is a class (implicitly constructable).
 */
export function validateScannedDependencies(scanned: ScannedModule): DependencyDiagnostic[] {
  const registeredTokens = new Set<InjectionToken>(scanned.providers.map((p) => p.token));
  const diagnostics: DependencyDiagnostic[] = [];
  const visited = new Set<InjectionToken>();

  function walk(token: InjectionToken, deps: InjectionToken[]): void {
    if (visited.has(token)) return;
    visited.add(token);

    for (const dep of deps) {
      if (registeredTokens.has(dep)) {
        const provider = scanned.providers.find((p) => p.token === dep);
        if (provider) {
          walk(dep, provider.dependencies);
        }
      } else if (typeof dep === "function") {
        walk(dep, getClassDependencyTokens(dep as Type));
      } else {
        diagnostics.push({
          consumer: serializeToken(token),
          dependency: serializeToken(dep),
        });
      }
    }
  }

  for (const provider of scanned.providers) {
    walk(provider.token, provider.dependencies);
  }

  return diagnostics;
}

function serializeToken(token: InjectionToken): string {
  if (typeof token === "function") return token.name;
  if (typeof token === "symbol") return token.description ?? "Symbol()";
  return String(token);
}
