import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type {
  HandlerRegistry,
  ServerlessAdapter,
  ResolvedHandler,
  PipelineOptions,
} from "@celerity-sdk/core";
import { executeHandlerPipeline } from "@celerity-sdk/core";
import { mapApiGatewayV2Event, mapHttpResponseToResult } from "./event-mapper";

export class AwsLambdaAdapter implements ServerlessAdapter {
  createHandler(
    registry: HandlerRegistry,
    options: PipelineOptions,
  ): (event: unknown, context: unknown) => Promise<unknown> {
    let cachedHandler: ResolvedHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<APIGatewayProxyResultV2> => {
      const apiEvent = event as APIGatewayProxyEventV2;
      const httpRequest = mapApiGatewayV2Event(apiEvent);

      if (!cachedHandler) {
        cachedHandler = registry.getHandler(httpRequest.path, httpRequest.method) ?? null;
      }

      if (!cachedHandler) {
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
