import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { PipelineOptions } from "@celerity-sdk/core";
import {
  discoverModule,
  bootstrap,
  executeHandlerPipeline,
  createDefaultSystemLayers,
  disposeLayers,
} from "@celerity-sdk/core";
import type { HandlerRegistry } from "@celerity-sdk/core";
import { mapApiGatewayV2Event, mapHttpResponseToResult } from "./event-mapper";

let cached: { registry: HandlerRegistry; options: PipelineOptions } | null = null;
let shutdownRegistered = false;

function registerShutdownHandler(options: PipelineOptions): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  process.on("SIGTERM", async () => {
    await options.container.closeAll();
    await disposeLayers([...(options.systemLayers ?? []), ...(options.appLayers ?? [])]);
    process.exit(0);
  });
}

async function ensureBootstrapped(): Promise<{
  registry: HandlerRegistry;
  options: PipelineOptions;
}> {
  if (!cached) {
    const systemLayers = await createDefaultSystemLayers();
    const rootModule = await discoverModule();
    const result = await bootstrap(rootModule);
    cached = {
      registry: result.registry,
      options: {
        container: result.container,
        systemLayers,
      },
    };
  }
  return cached;
}

export async function handler(event: unknown, _context: unknown): Promise<APIGatewayProxyResultV2> {
  const { registry, options } = await ensureBootstrapped();
  registerShutdownHandler(options);
  const apiEvent = event as APIGatewayProxyEventV2;
  const httpRequest = mapApiGatewayV2Event(apiEvent);

  const resolved = registry.getHandler(httpRequest.path, httpRequest.method);
  if (!resolved) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        statusCode: 404,
        message: `No handler for ${httpRequest.method} ${httpRequest.path}`,
      }),
    };
  }

  const httpResponse = await executeHandlerPipeline(resolved, httpRequest, options);
  return mapHttpResponseToResult(httpResponse);
}
