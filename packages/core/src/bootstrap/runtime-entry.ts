import { resolve, dirname } from "node:path";
import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { executeHandlerPipeline } from "../handlers/pipeline";
import { resolveHandlerByModuleRef } from "../handlers/module-resolver";
import { discoverModule } from "./discovery";
import { bootstrap } from "./bootstrap";
import { mapRuntimeRequest, mapToRuntimeResponse } from "./runtime-mapper";
import { createDefaultSystemLayers } from "../layers/system";

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

  return {
    registry,
    container,
    createRouteCallback(path: string, method: string) {
      return buildCallback(registry.getHandler(path, method));
    },
    async createRouteCallbackById(handlerId: string, codeLocation?: string) {
      const fromRegistry = registry.getHandlerById(handlerId);
      if (fromRegistry) return buildCallback(fromRegistry);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, registry, baseDir);
      return resolved ? buildCallback(resolved) : null;
    },
  };
}
