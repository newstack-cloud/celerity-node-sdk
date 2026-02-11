import { resolve, dirname } from "node:path";
import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type {
  CelerityLayer,
  FunctionHandlerDefinition,
  InjectionToken,
  Type,
} from "@celerity-sdk/types";
import createDebug from "debug";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import type { ResolvedHandler } from "../handlers/pipeline";
import { executeHandlerPipeline } from "../handlers/pipeline";
import { discoverModule } from "./discovery";
import { bootstrap } from "./bootstrap";
import { mapRuntimeRequest, mapToRuntimeResponse } from "./runtime-mapper";
import { createDefaultSystemLayers } from "../layers/system";

const debug = createDebug("celerity:core:runtime-entry");

type RuntimeCallback = (err: Error | null, request: RuntimeRequest) => Promise<RuntimeResponse>;

export type RuntimeBootstrapResult = {
  registry: HandlerRegistry;
  container: Container;
  /** Create a runtime-compatible handler callback for a specific route. */
  createRouteCallback(path: string, method: string): RuntimeCallback | null;
  /**
   * Create a runtime-compatible handler callback by handler ID.
   * First tries a direct registry lookup. If that fails, resolves the handler ID
   * as a module reference by dynamically importing the module and matching the
   * exported function against the registry.
   *
   * Supported formats:
   * - `"handlers.hello"` — named export `hello` from module `handlers`
   * - `"handlers"` — default export from module `handlers`
   * - `"app.module"` — dotted module name: tries named export split first,
   *   falls back to default export from module `app.module`
   */
  createRouteCallbackById(
    handlerId: string,
    codeLocation?: string,
  ): Promise<RuntimeCallback | null>;
};

/**
 * Bootstrap the user's module and return an object with per-route callback creation.
 * Used by the runtime host to get handler callbacks for each blueprint route.
 */
export async function bootstrapForRuntime(
  modulePath?: string,
  systemLayers?: (CelerityLayer | Type<CelerityLayer>)[],
): Promise<RuntimeBootstrapResult> {
  // Resolve system layers first — triggers OTel SDK init before user module loads.
  const layers = systemLayers ?? (await createDefaultSystemLayers());

  const resolvedModulePath = modulePath ?? process.env.CELERITY_MODULE_PATH;
  const moduleDir = resolvedModulePath ? dirname(resolve(resolvedModulePath)) : process.cwd();

  const rootModule = await discoverModule(modulePath);
  const { container, registry } = await bootstrap(rootModule);

  function buildCallback(
    handler: ReturnType<HandlerRegistry["getHandler"]>,
  ): RuntimeCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, request: RuntimeRequest): Promise<RuntimeResponse> => {
      const httpRequest = mapRuntimeRequest(request);
      const httpResponse = await executeHandlerPipeline(handler, httpRequest, {
        container,
        systemLayers: layers,
      });
      return mapToRuntimeResponse(httpResponse);
    };
  }

  /** Try to dynamically import a module and resolve a specific export to a callback. */
  async function tryResolveExport(
    baseDir: string,
    moduleName: string,
    exportName: string,
    handlerId: string,
  ): Promise<RuntimeCallback | null> {
    const handlerModulePath = resolve(baseDir, moduleName);

    let mod: Record<string, unknown>;
    try {
      mod = (await import(handlerModulePath)) as Record<string, unknown>;
    } catch {
      try {
        mod = (await import(`${handlerModulePath}.js`)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    const exported = mod[exportName];
    if (!exported) return null;

    const isFnDef =
      typeof exported === "object" &&
      exported !== null &&
      (exported as Record<string, unknown>).__celerity_handler;
    const handlerFn = isFnDef ? (exported as FunctionHandlerDefinition).handler : exported;
    if (typeof handlerFn !== "function") return null;

    // Handler functions are expected to be created wit createHttpHandler, which will register them in the HandlerRegistry
    // without an ID. The module import should have used the shared Node.js module cache,
    // so we can find the same function reference in the registry and match it with the handler ID derived
    // from the module path + export name.
    // This is primarily used for the case where a developer will define the routing information
    // in a blueprint and create a handler function in code without any route information as is common
    // in serverless application development.
    const match = registry.getAllHandlers().find((h) => h.handlerFn === handlerFn);
    if (match) {
      match.id = handlerId;
      debug("createRouteCallbackById: matched '%s' to registry handler", handlerId);
      return buildCallback(match);
    }

    debug("createRouteCallbackById: '%s' not in registry, wrapping directly", handlerId);
    return buildCallback(buildResolvedFromExport(handlerId, handlerFn, isFnDef ? exported : null));
  }

  return {
    registry,
    container,
    createRouteCallback(path: string, method: string) {
      return buildCallback(registry.getHandler(path, method));
    },
    async createRouteCallbackById(handlerId: string, codeLocation?: string) {
      // 1. Direct registry lookup by ID
      const fromRegistry = registry.getHandlerById(handlerId);
      if (fromRegistry) return buildCallback(fromRegistry);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;

      // 2. If there's a dot, try "module.export" split (named export) first
      const lastDot = handlerId.lastIndexOf(".");
      if (lastDot > 0) {
        const module = handlerId.slice(0, lastDot);
        const exportName = handlerId.slice(lastDot + 1);
        const result = await tryResolveExport(baseDir, module, exportName, handlerId);
        if (result) return result;
      }

      // 3. Fallback: treat full handler ID as module name with default export.
      //    Handles no-dot refs (e.g. "myModule") and dotted module names
      //    (e.g. "app.module" from app.module.js) where the named export split failed.
      return tryResolveExport(baseDir, handlerId, "default", handlerId);
    },
  };
}

function buildResolvedFromExport(
  handlerId: string,
  handlerFn: unknown,
  fnDef: unknown,
): ResolvedHandler {
  if (fnDef) {
    const meta = (fnDef as FunctionHandlerDefinition).metadata as {
      layers?: (CelerityLayer | Type<CelerityLayer>)[];
      inject?: InjectionToken[];
      customMetadata?: Record<string, unknown>;
    };
    return {
      id: handlerId,
      protectedBy: [],
      layers: [...(meta.layers ?? [])],
      isPublic: false,
      paramMetadata: [],
      customMetadata: meta.customMetadata ?? {},
      handlerFn: handlerFn as (...args: unknown[]) => unknown,
      isFunctionHandler: true,
      injectTokens: meta.inject ?? [],
    };
  }

  return {
    id: handlerId,
    protectedBy: [],
    layers: [],
    isPublic: false,
    paramMetadata: [],
    customMetadata: {},
    handlerFn: handlerFn as (...args: unknown[]) => unknown,
    isFunctionHandler: true,
    injectTokens: [],
  };
}
