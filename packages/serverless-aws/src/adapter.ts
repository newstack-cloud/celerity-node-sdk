import { dirname, resolve } from "node:path";
import createDebug from "debug";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  SQSEvent,
  SQSBatchResponse,
} from "aws-lambda";
import type { EventBridgeEvent } from "aws-lambda/trigger/eventbridge";
import type {
  HandlerRegistry,
  ServerlessAdapter,
  ServerlessHandler,
  ResolvedHttpHandler,
  ResolvedWebSocketHandler,
  ResolvedConsumerHandler,
  ResolvedScheduleHandler,
  ResolvedCustomHandler,
  PipelineOptions,
} from "@celerity-sdk/core";
import {
  executeHttpPipeline,
  executeWebSocketPipeline,
  executeConsumerPipeline,
  executeSchedulePipeline,
  executeCustomPipeline,
  resolveHandlerByModuleRef,
} from "@celerity-sdk/core";
import { WebSocketSender as WS_SENDER_TOKEN } from "@celerity-sdk/types";
import {
  mapApiGatewayV2Event,
  mapHttpResponseToResult,
  mapApiGatewayWebSocketEvent,
  mapSqsEvent,
  mapEventBridgeEvent,
  mapConsumerResultToSqsBatchResponse,
} from "./event-mapper";
import { ApiGatewayWebSocketSender } from "./websocket-sender";

const debug = createDebug("celerity:serverless-aws");

type AwsLambdaAdapterConfig = {
  handlerId?: string;
  handlerTag?: string;
  moduleDir: string;
};

export class AwsLambdaAdapter implements ServerlessAdapter {
  config: AwsLambdaAdapterConfig;
  private wsSenderRegistered = false;

  constructor() {
    this.config = captureAwsLambdaConfig();
  }

  createHttpHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler {
    let cachedHandler: ResolvedHttpHandler | null = null;

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
          (this.config.handlerId
            ? registry.getHandlerById("http", this.config.handlerId)
            : undefined) ?? null;

        if (!cachedHandler && this.config.handlerId) {
          cachedHandler = (await resolveHandlerByModuleRef(
            this.config.handlerId,
            "http",
            registry,
            this.config.moduleDir,
          )) as ResolvedHttpHandler | null;
        }

        if (!cachedHandler) {
          cachedHandler =
            registry.getHandler("http", `${httpRequest.method} ${httpRequest.path}`) ?? null;
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

      const httpResponse = await executeHttpPipeline(cachedHandler, httpRequest, options);
      return mapHttpResponseToResult(httpResponse);
    };
  }

  createWebSocketHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler {
    let cachedHandler: ResolvedWebSocketHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<{ statusCode: number }> => {
      const wsEvent = event as APIGatewayProxyWebsocketEventV2;
      const { message, routeKey, endpoint } = mapApiGatewayWebSocketEvent(wsEvent);

      // Register WebSocket sender once
      if (!this.wsSenderRegistered) {
        const sender = new ApiGatewayWebSocketSender(endpoint);
        options.container.register(WS_SENDER_TOKEN, { useValue: sender });
        this.wsSenderRegistered = true;
        debug("adapter: registered ApiGatewayWebSocketSender for endpoint=%s", endpoint);
      }

      if (!cachedHandler) {
        debug("adapter: cache miss, looking up WebSocket handler for routeKey=%s", routeKey);

        cachedHandler =
          (this.config.handlerId
            ? registry.getHandlerById("websocket", this.config.handlerId)
            : undefined) ?? null;

        if (!cachedHandler && this.config.handlerId) {
          cachedHandler = (await resolveHandlerByModuleRef(
            this.config.handlerId,
            "websocket",
            registry,
            this.config.moduleDir,
          )) as ResolvedWebSocketHandler | null;
        }

        if (!cachedHandler) {
          cachedHandler = registry.getHandler("websocket", routeKey) ?? null;
        }
      } else {
        debug("adapter: using cached WebSocket handler");
      }

      if (!cachedHandler) {
        debug("adapter: no WebSocket handler found → 404");
        return { statusCode: 404 };
      }

      await executeWebSocketPipeline(cachedHandler, message, options);
      return { statusCode: 200 };
    };
  }

  createConsumerHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler {
    let cachedHandler: ResolvedConsumerHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<SQSBatchResponse> => {
      const sqsEvent = event as SQSEvent;
      const handlerTag = this.config.handlerTag ?? sqsEvent.Records[0]?.eventSourceARN ?? "unknown";
      const consumerEvent = mapSqsEvent(sqsEvent, handlerTag);

      if (!cachedHandler) {
        debug("adapter: cache miss, looking up Consumer handler for tag=%s", handlerTag);

        cachedHandler =
          (this.config.handlerId
            ? registry.getHandlerById("consumer", this.config.handlerId)
            : undefined) ?? null;

        if (!cachedHandler && this.config.handlerId) {
          cachedHandler = (await resolveHandlerByModuleRef(
            this.config.handlerId,
            "consumer",
            registry,
            this.config.moduleDir,
          )) as ResolvedConsumerHandler | null;
        }

        if (!cachedHandler) {
          cachedHandler = registry.getHandler("consumer", handlerTag) ?? null;
        }
      } else {
        debug("adapter: using cached Consumer handler");
      }

      if (!cachedHandler) {
        debug("adapter: no Consumer handler found → empty response");
        return { batchItemFailures: [] };
      }

      const result = await executeConsumerPipeline(cachedHandler, consumerEvent, options);
      return mapConsumerResultToSqsBatchResponse(result.failures);
    };
  }

  createScheduleHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler {
    let cachedHandler: ResolvedScheduleHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<unknown> => {
      const ebEvent = event as EventBridgeEvent<string, unknown>;
      const handlerTag = this.config.handlerTag ?? ebEvent.resources?.[0] ?? "unknown";
      const scheduleEvent = mapEventBridgeEvent(ebEvent, handlerTag);

      if (!cachedHandler) {
        debug("adapter: cache miss, looking up Schedule handler for tag=%s", handlerTag);

        cachedHandler =
          (this.config.handlerId
            ? registry.getHandlerById("schedule", this.config.handlerId)
            : undefined) ?? null;

        if (!cachedHandler && this.config.handlerId) {
          cachedHandler = (await resolveHandlerByModuleRef(
            this.config.handlerId,
            "schedule",
            registry,
            this.config.moduleDir,
          )) as ResolvedScheduleHandler | null;
        }

        if (!cachedHandler) {
          cachedHandler = registry.getHandler("schedule", handlerTag) ?? null;
        }
      } else {
        debug("adapter: using cached Schedule handler");
      }

      if (!cachedHandler) {
        debug("adapter: no Schedule handler found");
        return { success: false, errorMessage: `No handler for schedule tag: ${handlerTag}` };
      }

      return executeSchedulePipeline(cachedHandler, scheduleEvent, options);
    };
  }

  createCustomHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler {
    let cachedHandler: ResolvedCustomHandler | null = null;

    return async (event: unknown, _context: unknown): Promise<unknown> => {
      let handlerName: string | undefined = this.config.handlerId;
      let payload: unknown = event;

      if (!handlerName && event && typeof event === "object") {
        const e = event as Record<string, unknown>;
        if (typeof e.handlerName === "string") {
          handlerName = e.handlerName;
          payload = e.payload ?? {};
        }
      }

      if (!cachedHandler) {
        debug("adapter: cache miss, looking up Custom handler for name=%s", handlerName);

        cachedHandler =
          (handlerName ? registry.getHandlerById("custom", handlerName) : undefined) ?? null;

        if (!cachedHandler && handlerName) {
          cachedHandler = (await resolveHandlerByModuleRef(
            handlerName,
            "custom",
            registry,
            this.config.moduleDir,
          )) as ResolvedCustomHandler | null;
        }

        if (!cachedHandler && handlerName) {
          cachedHandler = registry.getHandler("custom", handlerName) ?? null;
        }

        if (!cachedHandler) {
          const allCustom = registry.getHandlersByType("custom");
          if (allCustom.length === 1) cachedHandler = allCustom[0];
        }
      } else {
        debug("adapter: using cached Custom handler");
      }

      if (!cachedHandler) {
        debug("adapter: no Custom handler found");
        return { error: `No handler found for custom invoke: ${handlerName ?? "unknown"}` };
      }

      return executeCustomPipeline(cachedHandler, payload, options);
    };
  }
}

function captureAwsLambdaConfig(): AwsLambdaAdapterConfig {
  const modulePath = process.env.CELERITY_MODULE_PATH;
  return {
    handlerId: process.env.CELERITY_HANDLER_ID,
    handlerTag: process.env.CELERITY_HANDLER_TAG,
    moduleDir: modulePath ? dirname(resolve(modulePath)) : process.cwd(),
  };
}
