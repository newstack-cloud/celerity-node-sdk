import "reflect-metadata";
import createDebug from "debug";
import type {
  Type,
  InjectionToken,
  Provider,
  ModuleMetadata,
  FunctionHandlerDefinition,
} from "@celerity-sdk/types";
import { MODULE_METADATA } from "../metadata/constants";
import type { Container } from "../di/container";
import { tokenToString } from "../di/container";
import { getClassDependencyTokens, getProviderDependencyTokens } from "../di/dependency-tokens";

const debug = createDebug("celerity:core:bootstrap");

export type ModuleNode = {
  moduleClass: Type;
  ownTokens: Set<InjectionToken>;
  exports: Set<InjectionToken>;
  imports: Type[];
  controllers: Type[];
  functionHandlers: FunctionHandlerDefinition[];
  providers: (Type | (Provider & { provide: InjectionToken }))[];
};

export type ModuleGraph = Map<Type, ModuleNode>;

/**
 * Builds a module graph by walking the module tree depth-first, collecting
 * all metadata into a graph structure without any side effects.
 *
 * Detects circular module imports and deduplicates visited modules.
 */
export function buildModuleGraph(rootModule: Type): ModuleGraph {
  const graph: ModuleGraph = new Map();
  const resolving = new Set<Type>();

  function walk(moduleClass: Type, importChain: Type[]): void {
    if (graph.has(moduleClass)) {
      debug("walk %s → already visited", moduleClass.name);
      return;
    }

    if (resolving.has(moduleClass)) {
      const cyclePath = [...importChain, moduleClass].map((m) => m.name).join(" → ");
      throw new Error(`Circular module import detected: ${cyclePath}`);
    }

    resolving.add(moduleClass);

    const metadata: ModuleMetadata | undefined = Reflect.getOwnMetadata(
      MODULE_METADATA,
      moduleClass,
    );

    if (!metadata) {
      resolving.delete(moduleClass);
      graph.set(moduleClass, {
        moduleClass,
        ownTokens: new Set(),
        exports: new Set(),
        imports: [],
        controllers: [],
        functionHandlers: [],
        providers: [],
      });
      return;
    }

    // Recurse into imports first (depth-first)
    const imports = metadata.imports ?? [];
    for (const imported of imports) {
      walk(imported, [...importChain, moduleClass]);
    }

    // Collect own tokens from providers
    const ownTokens = new Set<InjectionToken>();
    const providers = metadata.providers ?? [];
    for (const provider of providers) {
      if (typeof provider === "function") {
        ownTokens.add(provider);
      } else {
        const typed = provider as Provider & { provide: InjectionToken };
        ownTokens.add(typed.provide);
      }
    }

    // Controllers are also own tokens
    const controllers = metadata.controllers ?? [];
    for (const controller of controllers) {
      ownTokens.add(controller);
    }

    // Build exports set — defaults to empty (nothing exported) when omitted
    const exportTokens = new Set<InjectionToken>(metadata.exports ?? []);

    resolving.delete(moduleClass);
    debug(
      "walk %s: %d providers, %d controllers, %d imports",
      moduleClass.name,
      providers.length,
      controllers.length,
      imports.length,
    );
    graph.set(moduleClass, {
      moduleClass,
      ownTokens,
      exports: exportTokens,
      imports,
      controllers,
      functionHandlers: metadata.functionHandlers ?? [],
      providers,
    });
  }

  walk(rootModule, []);
  return graph;
}

/**
 * Registers all providers and controllers from the module graph into the
 * DI container.
 */
export function registerModuleGraph(graph: ModuleGraph, container: Container): void {
  for (const [, node] of graph) {
    for (const provider of node.providers) {
      if (typeof provider === "function") {
        container.registerClass(provider);
      } else {
        const typed = provider as Provider & { provide: InjectionToken };
        container.register(typed.provide, typed);
      }
    }

    for (const controller of node.controllers) {
      if (!container.has(controller)) {
        container.registerClass(controller);
      }
    }
  }
}

/**
 * Walks the module tree once, depth-first, registering providers in the container
 * and collecting all module metadata into a graph structure.
 *
 * Detects circular module imports and deduplicates visited modules.
 */
export function walkModuleGraph(rootModule: Type, container: Container): ModuleGraph {
  const graph = buildModuleGraph(rootModule);
  registerModuleGraph(graph, container);
  return graph;
}

type Diagnostic = {
  type: "missing_dependency" | "export_violation" | "invalid_export";
  message: string;
};

/**
 * Validates the module graph for:
 * 1. All provider dependencies are resolvable (replaces container.validateDependencies)
 * 2. Cross-module dependencies respect export boundaries
 * 3. Exported tokens are actually owned by the module
 */
export function validateModuleGraph(graph: ModuleGraph, container: Container): void {
  const diagnostics: Diagnostic[] = [];

  for (const [, node] of graph) {
    // Check that exported tokens are owned by this module
    for (const exportToken of node.exports) {
      if (!node.ownTokens.has(exportToken)) {
        diagnostics.push({
          type: "invalid_export",
          message:
            `${node.moduleClass.name} exports ${tokenToString(exportToken)}, ` +
            "but that token is not provided by this module.",
        });
      }
    }

    // Compute visible tokens: own + exported tokens from imported modules
    const visibleTokens = new Set<InjectionToken>(node.ownTokens);
    for (const importedModule of node.imports) {
      const importedNode = graph.get(importedModule);
      if (importedNode) {
        for (const exportedToken of importedNode.exports) {
          visibleTokens.add(exportedToken);
        }
      }
    }

    // Validate each provider's dependencies
    for (const provider of node.providers) {
      let depTokens: InjectionToken[];
      let consumerToken: InjectionToken;

      if (typeof provider === "function") {
        consumerToken = provider;
        depTokens = getClassDependencyTokens(provider);
      } else {
        const typed = provider as Provider & { provide: InjectionToken };
        consumerToken = typed.provide;
        depTokens = getProviderDependencyTokens(typed);
      }

      checkDependencies(
        consumerToken,
        depTokens,
        visibleTokens,
        node.moduleClass,
        graph,
        container,
        diagnostics,
      );
    }

    // Validate each controller's dependencies
    for (const controller of node.controllers) {
      const depTokens = getClassDependencyTokens(controller);
      checkDependencies(
        controller,
        depTokens,
        visibleTokens,
        node.moduleClass,
        graph,
        container,
        diagnostics,
      );
    }
  }

  debug("validateModuleGraph: %d modules, %d diagnostics", graph.size, diagnostics.length);

  if (diagnostics.length > 0) {
    const details = diagnostics.map((d) => `  ${d.message}`).join("\n");
    throw new Error(`Module validation errors:\n\n${details}`);
  }
}

function checkDependencies(
  consumer: InjectionToken,
  depTokens: InjectionToken[],
  visibleTokens: Set<InjectionToken>,
  moduleClass: Type,
  graph: ModuleGraph,
  container: Container,
  diagnostics: Diagnostic[],
): void {
  for (const dep of depTokens) {
    if (visibleTokens.has(dep)) continue;

    // Check if the token is owned by some module in the graph
    const ownerModule = findTokenOwner(dep, graph);
    if (ownerModule) {
      const ownerNode = graph.get(ownerModule)!;
      if (ownerNode.exports.has(dep)) {
        // Token IS exported from its owner, but that module isn't directly imported
        diagnostics.push({
          type: "export_violation",
          message:
            `${tokenToString(consumer)} in ${moduleClass.name} depends on ${tokenToString(dep)}, ` +
            `which is exported from ${ownerModule.name} but ${moduleClass.name} does not import ${ownerModule.name}. ` +
            `Add ${ownerModule.name} to ${moduleClass.name}'s "imports" array.`,
        });
      } else {
        // Token exists but isn't exported from its owner
        diagnostics.push({
          type: "export_violation",
          message:
            `${tokenToString(consumer)} in ${moduleClass.name} depends on ${tokenToString(dep)}, ` +
            `but ${tokenToString(dep)} is not exported from ${ownerModule.name}. ` +
            `Add ${tokenToString(dep)} to ${ownerModule.name}'s "exports" array.`,
        });
      }
      continue;
    }

    // Unregistered class token — auto-adopt into this module's visible scope.
    // The class becomes available within this module only (not exported).
    // Its own dependencies are recursively validated against the same boundaries.
    if (typeof dep === "function") {
      if (!container.has(dep)) {
        container.registerClass(dep);
      }
      visibleTokens.add(dep);

      const adoptedDeps = getClassDependencyTokens(dep);
      checkDependencies(
        dep,
        adoptedDeps,
        visibleTokens,
        moduleClass,
        graph,
        container,
        diagnostics,
      );
      continue;
    }

    // Truly missing — no provider registered for this non-class token
    diagnostics.push({
      type: "missing_dependency",
      message:
        `${tokenToString(consumer)} in ${moduleClass.name} requires ${tokenToString(dep)} — no provider registered. ` +
        'Ensure the module providing it is included in your module\'s "imports" array, ' +
        "or register a provider for it directly.",
    });
  }
}

function findTokenOwner(token: InjectionToken, graph: ModuleGraph): Type | null {
  for (const [, node] of graph) {
    if (node.ownTokens.has(token)) {
      return node.moduleClass;
    }
  }
  return null;
}
