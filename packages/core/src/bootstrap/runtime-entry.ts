import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { executeHandlerPipeline } from "../handlers/pipeline";
import { discoverModule } from "./discovery";
import { bootstrap } from "./bootstrap";
import { mapRuntimeRequest, mapToRuntimeResponse } from "./runtime-mapper";
import { createDefaultSystemLayers } from "../layers/system";

export type RuntimeBootstrapResult = {
  registry: HandlerRegistry;
  container: Container;
  /** Create a runtime-compatible handler callback for a specific route. */
  createRouteCallback(
    path: string,
    method: string,
  ): ((err: Error | null, request: RuntimeRequest) => Promise<RuntimeResponse>) | null;
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
  const rootModule = await discoverModule(modulePath);
  const { container, registry } = await bootstrap(rootModule);

  return {
    registry,
    container,
    createRouteCallback(path: string, method: string) {
      const handler = registry.getHandler(path, method);
      if (!handler) return null;

      return async (_err: Error | null, request: RuntimeRequest): Promise<RuntimeResponse> => {
        const httpRequest = mapRuntimeRequest(request);
        const httpResponse = await executeHandlerPipeline(handler, httpRequest, {
          container,
          systemLayers: layers,
        });
        return mapToRuntimeResponse(httpResponse);
      };
    },
  };
}
