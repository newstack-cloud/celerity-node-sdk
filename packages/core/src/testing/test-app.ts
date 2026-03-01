import type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  CelerityLayer,
  Type,
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketEventType,
  ConsumerEventInput,
  ConsumerMessage,
  ScheduleEventInput,
  EventResult,
} from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { executeHttpPipeline } from "../handlers/http-pipeline";
import { executeWebSocketPipeline } from "../handlers/websocket-pipeline";
import { executeConsumerPipeline } from "../handlers/consumer-pipeline";
import { executeSchedulePipeline } from "../handlers/schedule-pipeline";
import { executeCustomPipeline } from "../handlers/custom-pipeline";
import { NotFoundException } from "../errors/http-exception";

export class TestingApplication {
  constructor(
    private registry: HandlerRegistry,
    private container: Container,
    private systemLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private appLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
  ) {}

  async injectHttp(request: HttpRequest): Promise<HttpResponse> {
    const handler = this.registry.getHandler("http", `${request.method} ${request.path}`);
    if (!handler) {
      throw new NotFoundException(`No handler found for ${request.method} ${request.path}`);
    }
    return executeHttpPipeline(handler, request, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  async injectWebSocket(route: string, message: WebSocketMessage): Promise<void> {
    const handler = this.registry.getHandler("websocket", route);
    if (!handler) {
      throw new NotFoundException(`No WebSocket handler found for route: ${route}`);
    }
    await executeWebSocketPipeline(handler, message, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  async injectConsumer(handlerTag: string, event: ConsumerEventInput): Promise<EventResult> {
    const handler = this.registry.getHandler("consumer", handlerTag);
    if (!handler) {
      throw new NotFoundException(`No consumer handler found for tag: ${handlerTag}`);
    }
    return executeConsumerPipeline(handler, event, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  async injectSchedule(handlerTag: string, event: ScheduleEventInput): Promise<EventResult> {
    const handler = this.registry.getHandler("schedule", handlerTag);
    if (!handler) {
      throw new NotFoundException(`No schedule handler found for tag: ${handlerTag}`);
    }
    return executeSchedulePipeline(handler, event, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  async injectCustom(name: string, payload?: unknown): Promise<unknown> {
    const handler = this.registry.getHandler("custom", name);
    if (!handler) {
      throw new NotFoundException(`No custom handler found for name: ${name}`);
    }
    return executeCustomPipeline(handler, payload ?? null, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
  }

  getContainer(): Container {
    return this.container;
  }

  getRegistry(): HandlerRegistry {
    return this.registry;
  }
}

// ---------------------------------------------------------------------------
// Mock factories — HTTP
// ---------------------------------------------------------------------------

export type MockRequestOptions = {
  pathParams?: Record<string, string>;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
  body?: unknown;
  auth?: Record<string, unknown>;
  requestId?: string;
  clientIp?: string;
};

export function mockRequest(
  method: HttpMethod,
  path: string,
  options: MockRequestOptions = {},
): HttpRequest {
  return {
    method,
    path,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    headers: options.headers ?? {},
    cookies: options.cookies ?? {},
    textBody: options.body !== undefined ? JSON.stringify(options.body) : null,
    binaryBody: null,
    contentType: options.body !== undefined ? "application/json" : null,
    requestId: options.requestId ?? "test-request-id",
    requestTime: new Date().toISOString(),
    auth: options.auth ?? null,
    clientIp: options.clientIp ?? "127.0.0.1",
    traceContext: null,
    userAgent: "celerity-testing",
    matchedRoute: null,
  };
}

// ---------------------------------------------------------------------------
// Mock factories — WebSocket
// ---------------------------------------------------------------------------

export type MockWebSocketMessageOptions = {
  messageType?: WebSocketMessageType;
  eventType?: WebSocketEventType;
  connectionId?: string;
  messageId?: string;
  jsonBody?: unknown;
  binaryBody?: Buffer;
  traceContext?: Record<string, string> | null;
};

export function mockWebSocketMessage(options: MockWebSocketMessageOptions = {}): WebSocketMessage {
  return {
    messageType: options.messageType ?? "json",
    eventType: options.eventType ?? "message",
    connectionId: options.connectionId ?? "test-conn-id",
    messageId: options.messageId ?? "test-msg-id",
    jsonBody: options.jsonBody ?? null,
    binaryBody: options.binaryBody,
    traceContext: options.traceContext ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mock factories — Consumer
// ---------------------------------------------------------------------------

export type MockConsumerMessage = {
  messageId?: string;
  body: string;
  source?: string;
  messageAttributes?: unknown;
};

export type MockConsumerEventOptions = {
  vendor?: unknown;
  traceContext?: Record<string, string> | null;
};

export function mockConsumerEvent(
  handlerTag: string,
  messages: MockConsumerMessage[],
  options: MockConsumerEventOptions = {},
): ConsumerEventInput {
  const builtMessages: ConsumerMessage[] = messages.map((msg, index) => ({
    messageId: msg.messageId ?? `msg-${index}`,
    body: msg.body,
    source: msg.source ?? "test",
    messageAttributes: msg.messageAttributes ?? {},
    vendor: {},
  }));

  return {
    handlerTag,
    messages: builtMessages,
    vendor: options.vendor ?? {},
    traceContext: options.traceContext ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mock factories — Schedule
// ---------------------------------------------------------------------------

export type MockScheduleEventOptions = {
  scheduleId?: string;
  messageId?: string;
  schedule?: string;
  input?: unknown;
  vendor?: unknown;
  traceContext?: Record<string, string> | null;
};

export function mockScheduleEvent(
  handlerTag: string,
  options: MockScheduleEventOptions = {},
): ScheduleEventInput {
  return {
    handlerTag,
    scheduleId: options.scheduleId ?? handlerTag,
    messageId: options.messageId ?? "test-schedule-msg-id",
    schedule: options.schedule ?? "rate(1 day)",
    input: options.input,
    vendor: options.vendor ?? {},
    traceContext: options.traceContext ?? null,
  };
}
