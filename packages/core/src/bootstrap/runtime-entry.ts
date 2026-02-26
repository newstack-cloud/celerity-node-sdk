import { resolve, dirname } from "node:path";
import createDebug from "debug";
import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HttpHandlerRegistry } from "../handlers/registry";
import { executeHandlerPipeline } from "../handlers/pipeline";
import {
  executeGuardPipeline,
  type GuardInput,
  type GuardResult,
} from "../handlers/guard-pipeline";
import { resolveHandlerByModuleRef } from "../handlers/module-resolver";
import { discoverModule } from "./discovery";
import { bootstrap } from "./bootstrap";
import { mapRuntimeRequest, mapToRuntimeResponse } from "./runtime-mapper";
import { createDefaultSystemLayers } from "../layers/system";

const debug = createDebug("celerity:core:runtime-entry");

type RuntimeCallback = (err: Error | null, request: RuntimeRequest) => Promise<RuntimeResponse>;
type GuardCallback = (input: GuardInput) => Promise<GuardResult>;

export type RuntimeBootstrapResult = {
  registry: HttpHandlerRegistry;
  container: Container;
  /** Create a runtime-compatible handler callback for a specific route. */
  createRouteCallback(path: string, method: string, handlerName?: string): RuntimeCallback | null;
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
    handlerName?: string,
  ): Promise<RuntimeCallback | null>;
  /** Create a runtime-compatible guard callback by guard name. */
  createGuardCallback(guardName: string): GuardCallback | null;
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
    handler: ReturnType<HttpHandlerRegistry["getHandler"]>,
    handlerName?: string,
  ): RuntimeCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, request: RuntimeRequest): Promise<RuntimeResponse> => {
      const httpRequest = mapRuntimeRequest(request);
      const httpResponse = await executeHandlerPipeline(handler, httpRequest, {
        container,
        systemLayers: layers,
        handlerName,
      });
      return mapToRuntimeResponse(httpResponse);
    };
  }

  return {
    registry,
    container,
    createRouteCallback(path: string, method: string, handlerName?: string) {
      return buildCallback(registry.getHandler(path, method), handlerName);
    },
    async createRouteCallbackById(handlerId: string, codeLocation?: string, handlerName?: string) {
      const fromRegistry = registry.getHandlerById(handlerId);
      if (fromRegistry) return buildCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, registry, baseDir);
      return resolved ? buildCallback(resolved, handlerName) : null;
    },
    createGuardCallback(guardName: string): GuardCallback | null {
      const guard = registry.getGuard(guardName);
      if (!guard) return null;
      return async (input: GuardInput) => {
        debug("guard %s — input method=%s path=%s", guardName, input.method, input.path);
        const handler = registry.getHandler(input.path, input.method);
        debug(
          "guard %s — handler %s, customMetadata=%o",
          guardName,
          handler ? "found" : "not found",
          handler?.customMetadata,
        );
        return executeGuardPipeline(guard, input, {
          container,
          handlerMetadata: handler?.customMetadata,
        });
      };
    },
  };
}
