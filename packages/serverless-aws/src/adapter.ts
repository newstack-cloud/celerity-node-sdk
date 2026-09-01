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
  planRouting,
  routesAsConsumer,
} from "@celerity-sdk/core";
import type { WebSocketMessage, ConsumerEventInput } from "@celerity-sdk/types";
import type { UnroutedMessage } from "@celerity-sdk/core";
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
import { clientAckRequest, composeClientAck } from "./client-ack";

const debug = createDebug("celerity:serverless-aws");

type AwsLambdaAdapterConfig = {
  handlerId?: string;
  handlerTag?: string;
  /**
   * The message-body field a routed consumer selects its handler on.
   *
   * Which handler to invoke is still addressed by the handler tag, as for every
   * other handler type. This says how to read a route out of a message, which is
   * information the tag cannot carry because it comes from the consumer's
   * blueprint declaration rather than from the handler.
   */
  routingKey?: string;
  moduleDir: string;
};

export class AwsLambdaAdapter implements ServerlessAdapter {
  config: AwsLambdaAdapterConfig;
  private wsSender: ApiGatewayWebSocketSender | null = null;

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
      if (!this.wsSender) {
        this.wsSender = new ApiGatewayWebSocketSender(endpoint);
        options.container.register(WS_SENDER_TOKEN, { useValue: this.wsSender });
        debug("adapter: registered ApiGatewayWebSocketSender for endpoint=%s", endpoint);
      }

      // Answered here rather than by the application, and before the handler
      // runs. The protocol says a message that asked to be acknowledged is
      // acknowledged on receipt, which is what lets a client stop its resend
      // timer without waiting on however long the work takes. It also has to
      // happen whether or not this message reaches a handler at all, the client
      // asked whether its message arrived, and it did.
      await this.acknowledgeReceipt(message);

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

  /**
   * Tells a client its message arrived, where it asked to be told.
   *
   * The application doesn't implement any of this, the protocol is the SDK's to
   * implement, and a handler that had to acknowledge its own messages would be
   * reimplementing it once per application, differently each time.
   *
   * A failure to acknowledge is logged and consumed. The message itself did
   * arrive, and failing the invocation over the receipt would have SQS-style
   * consequences the client never asked for, the client's own resend, after
   * its timeout, is the recovery the protocol already specifies for an
   * acknowledgement that goes missing.
   */
  private async acknowledgeReceipt(message: WebSocketMessage): Promise<void> {
    const messageId = clientAckRequest(message.jsonBody);
    if (!messageId || !this.wsSender) return;

    const timestamp = Math.floor(Date.now() / 1000);
    try {
      await this.wsSender.sendMessage(message.connectionId, composeClientAck(messageId, timestamp));
      debug("adapter: acknowledged message %s from %s", messageId, message.connectionId);
    } catch (err) {
      debug(
        "adapter: could not acknowledge message %s from %s: %s",
        messageId,
        message.connectionId,
        err instanceof Error ? err.message : String(err),
      );
    }
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
        // Nothing is registered under this tag as a single handler. A tag that
        // instead names a consumer marks a function serving that whole consumer,
        // which routes the batch itself. The source cannot route, since it hands
        // each message to whichever consumer polls first, so several functions on
        // one queue give an arbitrary handler rather than the declared one.
        //
        // Resolved last so every existing path keeps precedence. A function that
        // addresses one handler, by id or by tag, is dispatched to that handler
        // exactly as before, whether or not its consumer has routed siblings.
        if (routesAsConsumer(registry, handlerTag)) {
          return this.dispatchRoutedConsumer(registry, handlerTag, consumerEvent, options);
        }

        // Answering with no batch item failures reports every message as handled
        // and SQS deletes the batch, so a misconfigured function would quietly
        // consume the queue. Throwing leaves the messages to be retried and
        // redriven, and shows up as a failed invocation.
        debug("adapter: no Consumer handler found");
        throw new Error(
          `No handler for consumer tag: ${handlerTag}. ` +
            `The function is not reachable from its queue; check that CELERITY_HANDLER_TAG ` +
            `matches the key the handler is registered under.`,
        );
      }

      const result = await executeConsumerPipeline(cachedHandler, consumerEvent, options);
      return mapConsumerResultToSqsBatchResponse(result.failures);
    };
  }

  /**
   * Runs one batch across the handlers of a routed consumer.
   *
   * Each handler is invoked through the ordinary consumer pipeline with its own
   * subset of the batch, so layers, validation and the batch-shaped signature
   * behave exactly as they do for an unrouted consumer.
   *
   * Handlers run in sequence rather than concurrently. A batch is already the
   * unit of parallelism the source controls through its own concurrency, and
   * running the groups together would multiply the load a single message batch
   * can put on downstream resources without the author asking for it.
   *
   * A handler that throws fails only its own messages. The alternative, letting
   * the invocation fail, would redeliver the whole batch and re-run the handlers
   * that had already succeeded, which for anything not idempotent is worse than
   * the failure itself.
   */
  private async dispatchRoutedConsumer(
    registry: HandlerRegistry,
    consumerName: string,
    consumerEvent: ConsumerEventInput,
    options: PipelineOptions,
  ): Promise<SQSBatchResponse> {
    const routingKey = this.config.routingKey ?? "event";

    const plan = planRouting(registry, consumerName, routingKey, consumerEvent.messages);
    debug(
      "adapter: routed consumer=%s key=%s batches=%d unrouted=%d",
      consumerName,
      routingKey,
      plan.batches.length,
      plan.unrouted.length,
    );

    if (plan.batches.length === 0 && plan.unrouted.length === 0) {
      return { batchItemFailures: [] };
    }

    if (plan.batches.length === 0 && consumerEvent.messages.length > 0) {
      // Nothing in the batch could be routed. That is a wiring fault rather than
      // a message fault, and failing the invocation surfaces it as an error
      // instead of leaving it to look like ordinary redelivery.
      throw new Error(
        `No handler on consumer "${consumerName}" could take any message in this batch. ` +
          `First reason: ${plan.unrouted[0].reason}.`,
      );
    }

    const failures: Array<{ messageId: string }> = plan.unrouted.map(
      ({ message, reason }: UnroutedMessage) => {
        debug("adapter: unrouted message %s — %s", message.messageId, reason);
        return { messageId: message.messageId };
      },
    );

    for (const batch of plan.batches) {
      try {
        const result = await executeConsumerPipeline(
          batch.handler,
          { ...consumerEvent, handlerTag: batch.handler.handlerTag, messages: batch.messages },
          options,
        );
        for (const failure of result.failures ?? []) failures.push(failure);
      } catch (err) {
        debug(
          "adapter: routed handler %s threw, failing its %d message(s): %s",
          batch.handler.handlerTag,
          batch.messages.length,
          err instanceof Error ? err.message : String(err),
        );
        for (const message of batch.messages) failures.push({ messageId: message.messageId });
      }
    }

    return mapConsumerResultToSqsBatchResponse(failures);
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
        // Returned as a value this is an ordinary result: the invocation
        // succeeds, no error metric moves and the schedule appears to be
        // running. Throwing is what makes a schedule that reaches nothing
        // visible.
        debug("adapter: no Schedule handler found");
        throw new Error(
          `No handler for schedule tag: ${handlerTag}. ` +
            `The scheduled function is not reachable from its rule; check that ` +
            `CELERITY_HANDLER_TAG matches the key the handler is registered under.`,
        );
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
    // Defaulted rather than required, so a target that tags a function with a
    // consumer but says nothing about the field still routes on the documented
    // default.
    routingKey: process.env.CELERITY_ROUTING_KEY || "event",
    moduleDir: modulePath ? dirname(resolve(modulePath)) : process.cwd(),
  };
}
