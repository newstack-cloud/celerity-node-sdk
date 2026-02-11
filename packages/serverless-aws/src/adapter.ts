import { dirname, resolve } from "node:path";
import createDebug from "debug";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type {
  HandlerRegistry,
  ServerlessAdapter,
  ResolvedHandler,
  PipelineOptions,
} from "@celerity-sdk/core";
import { executeHandlerPipeline, resolveHandlerByModuleRef } from "@celerity-sdk/core";
import { mapApiGatewayV2Event, mapHttpResponseToResult } from "./event-mapper";

const debug = createDebug("celerity:serverless-aws");

type AwsLambdaAdapterConfig = {
  handlerId?: string;
  moduleDir: string;
};

export class AwsLambdaAdapter implements ServerlessAdapter {
  config: AwsLambdaAdapterConfig;

  constructor() {
    // Capture config from environment variables on construction
    // to take a snapshot at the initialisation phase similarly to
    // how layers capture config.
    this.config = captureAwsLambdaConfig();
  }

  createHandler(
    registry: HandlerRegistry,
    options: PipelineOptions,
  ): (event: unknown, context: unknown) => Promise<unknown> {
    let cachedHandler: ResolvedHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<APIGatewayProxyResultV2> => {
      const apiEvent = event as APIGatewayProxyEventV2;
      const httpRequest = mapApiGatewayV2Event(apiEvent);

      if (!cachedHandler) {
        debug(
          "adapter: cache miss, looking up handler for %s %s",
          httpRequest.method,
          httpRequest.path,
        );

        cachedHandler =
          (this.config.handlerId ? registry.getHandlerById(this.config.handlerId) : undefined) ??
          null;

        if (!cachedHandler && this.config.handlerId) {
          cachedHandler = await resolveHandlerByModuleRef(
            this.config.handlerId,
            registry,
            this.config.moduleDir,
          );
        }

        if (!cachedHandler) {
          cachedHandler = registry.getHandler(httpRequest.path, httpRequest.method) ?? null;
        }
      } else {
        debug("adapter: using cached handler for %s %s", httpRequest.method, httpRequest.path);
      }

      if (!cachedHandler) {
        debug("adapter: no handler found → 404");
        return {
          statusCode: 404,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: `No handler for ${httpRequest.method} ${httpRequest.path}`,
          }),
        };
      }

      const httpResponse = await executeHandlerPipeline(cachedHandler, httpRequest, options);
      return mapHttpResponseToResult(httpResponse);
    };
  }
}

function captureAwsLambdaConfig(): AwsLambdaAdapterConfig {
  const modulePath = process.env.CELERITY_MODULE_PATH;
  return {
    handlerId: process.env.CELERITY_HANDLER_ID,
    moduleDir: modulePath ? dirname(resolve(modulePath)) : process.cwd(),
  };
}
