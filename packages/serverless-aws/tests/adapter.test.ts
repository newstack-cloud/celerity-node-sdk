import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ResolvedHandler, ResolvedHttpHandler, PipelineOptions } from "@celerity-sdk/core";

const mockResolveHandlerByModuleRef = vi.fn();
const mockExecuteHttpPipeline = vi.fn();
const mockExecuteWebSocketPipeline = vi.fn();
const mockExecuteConsumerPipeline = vi.fn();
const mockExecuteSchedulePipeline = vi.fn();
const mockExecuteCustomPipeline = vi.fn();

vi.mock("@celerity-sdk/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@celerity-sdk/core")>();
  return {
    ...actual,
    resolveHandlerByModuleRef: (...args: unknown[]) => mockResolveHandlerByModuleRef(...args),
    executeHttpPipeline: (...args: unknown[]) => mockExecuteHttpPipeline(...args),
    executeWebSocketPipeline: (...args: unknown[]) => mockExecuteWebSocketPipeline(...args),
    executeConsumerPipeline: (...args: unknown[]) => mockExecuteConsumerPipeline(...args),
    executeSchedulePipeline: (...args: unknown[]) => mockExecuteSchedulePipeline(...args),
    executeCustomPipeline: (...args: unknown[]) => mockExecuteCustomPipeline(...args),
  };
});

vi.mock("@celerity-sdk/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@celerity-sdk/types")>();
  return {
    ...actual,
    WebSocketSender: Symbol.for("celerity:websocket-sender"),
  };
});

import { AwsLambdaAdapter } from "../src/adapter";
import type { HttpMethod } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal mock of HandlerRegistry that satisfies the interface used by
 * AwsLambdaAdapter. The adapter calls `getHandler(type, routingKey)` and `getHandlerById(type, id)`.
 */
function createMockRegistry(handlers: ResolvedHandler[] = []) {
  return {
    getHandler: vi.fn((_type: string, routingKey: string) => {
      const spaceIdx = routingKey.indexOf(" ");
      if (spaceIdx === -1) {
        // Non-HTTP lookup (by tag or route key)
        return handlers.find((h) => (h as Record<string, unknown>).handlerTag === routingKey
          || (h as Record<string, unknown>).route === routingKey
          || (h as Record<string, unknown>).name === routingKey);
      }
      const method = routingKey.slice(0, spaceIdx);
      const path = routingKey.slice(spaceIdx + 1);
      return handlers.find((h) => {
        const r = h as Record<string, unknown>;
        return r.path != null && matchRoute(r.path as string, path) && r.method === method;
      });
    }),
    getHandlerById: vi.fn((_type: string, id: string) => {
      return handlers.find((h) => h.id === id || (h as Record<string, unknown>).id === id);
    }),
    getHandlersByType: vi.fn((): unknown[] => [...handlers]),
  };
}

/** Simple route matcher mirroring the one in HandlerRegistry. */
function matchRoute(pattern: string, actual: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);
  if (patternParts.length !== actualParts.length) return false;
  return patternParts.every(
    (part, i) => part.startsWith("{") || part === actualParts[i],
  );
}

/** Creates a minimal ResolvedHandler that returns a simple 200 JSON response. */
function createResolvedHandler(
  path: string,
  method: string,
  responseBody: unknown = { ok: true },
): ResolvedHttpHandler {
  return {
    type: "http",
    path,
    method: method as HttpMethod,
    protectedBy: [],
    layers: [],
    isPublic: true,
    paramMetadata: [],
    customMetadata: {},
    handlerFn: vi.fn(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(responseBody),
    })),
    isFunctionHandler: true,
  };
}

/** Creates a realistic API Gateway v2 event for use in adapter tests. */
function createApiGatewayEvent(
  method: string,
  path: string,
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
    },
    requestContext: {
      accountId: "123456789012",
      apiId: "test-api",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "TestRunner/1.0",
      },
      requestId: "test-req-id",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "2026-02-08T10:00:00Z",
      timeEpoch: 1770508800000,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

function createWsEvent(overrides: Record<string, unknown> = {}) {
  return {
    requestContext: {
      routeKey: "$default",
      messageId: "msg-1",
      eventType: "MESSAGE",
      extendedRequestId: "ext-1",
      requestTime: "2026-01-01T00:00:00Z",
      messageDirection: "IN",
      stage: "prod",
      connectedAt: 1000,
      requestTimeEpoch: 2000,
      requestId: "req-ws-1",
      domainName: "ws.example.com",
      connectionId: "conn-abc",
      apiId: "ws-api",
    },
    body: '{"action":"chat"}',
    isBase64Encoded: false,
    ...overrides,
  };
}

function createSqsEvent(recordCount = 1) {
  return {
    Records: Array.from({ length: recordCount }, (_, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `handle-${i}`,
      body: JSON.stringify({ item: i }),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1000",
        SenderId: "sender",
        ApproximateFirstReceiveTimestamp: "1000",
      },
      messageAttributes: {},
      md5OfBody: "abc",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:123:my-queue",
      awsRegion: "us-east-1",
    })),
  };
}

function createEventBridgeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-123",
    version: "0",
    account: "123456789012",
    time: "2026-01-01T00:00:00Z",
    region: "us-east-1",
    resources: ["arn:aws:events:us-east-1:123:rule/daily-sync"],
    source: "aws.events",
    "detail-type": "Scheduled Event",
    detail: { key: "value" },
    ...overrides,
  };
}

// ===========================================================================
// AwsLambdaAdapter
// ===========================================================================

const mockContainerRegister = vi.fn();

const mockOptions: PipelineOptions = {
  container: {
    resolve: vi.fn() as unknown as import("@celerity-sdk/types").ServiceContainer["resolve"],
    register: mockContainerRegister as unknown as import("@celerity-sdk/types").ServiceContainer["register"],
    has: vi.fn().mockReturnValue(false),
    closeAll: vi.fn().mockResolvedValue(undefined),
  },
};

describe("AwsLambdaAdapter", () => {
  let adapter: AwsLambdaAdapter;

  beforeEach(() => {
    mockResolveHandlerByModuleRef.mockReset();
    mockExecuteHttpPipeline.mockReset();
    mockExecuteWebSocketPipeline.mockReset();
    mockExecuteConsumerPipeline.mockReset();
    mockExecuteSchedulePipeline.mockReset();
    mockExecuteCustomPipeline.mockReset();
    mockContainerRegister.mockReset();
    adapter = new AwsLambdaAdapter();
  });

  // ---------------------------------------------------------------
  // createHttpHandler returns a function
  // ---------------------------------------------------------------
  describe("createHttpHandler", () => {
    it("returns a function", () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      expect(typeof handler).toBe("function");
    });

    it("returns an async function that accepts event and context", () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      expect(handler.constructor.name).toBe("AsyncFunction");
    });
  });

  // ---------------------------------------------------------------
  // 404 for unmatched routes
  // ---------------------------------------------------------------
  describe("unmatched routes", () => {
    it("returns 404 with a JSON body when no handler matches the route", async () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/nonexistent");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(result).toEqual({
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "No handler for GET /nonexistent",
        }),
      });
    });

    it("returns 404 when the path matches but the method does not", async () => {
      const getHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([getHandler]);
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("POST", "/items");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.message).toBe("No handler for POST /items");
    });

    it("includes the method and path in the 404 error message", async () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("DELETE", "/resources/42");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("DELETE");
      expect(body.message).toContain("/resources/42");
    });
  });

  // ---------------------------------------------------------------
  // Successful handler execution
  // ---------------------------------------------------------------
  describe("handler execution", () => {
    it("invokes the matched handler and returns the mapped response", async () => {
      const usersHandler = createResolvedHandler("/users", "GET", {
        users: ["Alice", "Bob"],
      });
      const registry = createMockRegistry([usersHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ users: ["Alice", "Bob"] }),
      });
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/users");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual({ "content-type": "application/json" });
      expect(JSON.parse(result.body as string)).toEqual({
        users: ["Alice", "Bob"],
      });
    });

    it("calls registry.getHandler with the correct path and method", async () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("POST", "/orders");

      await handler(event, {});

      expect(registry.getHandler).toHaveBeenCalledWith("http", "POST /orders");
    });
  });

  // ---------------------------------------------------------------
  // Cold start handler caching
  // ---------------------------------------------------------------
  describe("cold start handler caching", () => {
    it("resolves the handler on the first invocation and caches it for subsequent calls", async () => {
      const usersHandler = createResolvedHandler("/users", "GET");
      const registry = createMockRegistry([usersHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({ status: 200, body: "ok" });
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/users");

      await handler(event, {});
      await handler(event, {});

      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("uses the cached handler for all subsequent invocations", async () => {
      const responseBody = { cached: true };
      const cachedHandler = createResolvedHandler("/data", "GET", responseBody);
      const registry = createMockRegistry([cachedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(responseBody),
      });
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/data");

      const result1 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;
      const result2 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;
      const result3 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(JSON.parse(result1.body as string)).toEqual(responseBody);
      expect(JSON.parse(result2.body as string)).toEqual(responseBody);
      expect(JSON.parse(result3.body as string)).toEqual(responseBody);
      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("does not cache a null handler — retries lookup on each call when no match", async () => {
      const registry = createMockRegistry();
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/missing");

      await handler(event, {});
      await handler(event, {});

      expect(registry.getHandler).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------
  // CELERITY_HANDLER_ID env var lookup
  // ---------------------------------------------------------------
  describe("CELERITY_HANDLER_ID lookup", () => {
    afterEach(() => {
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("resolves handler by CELERITY_HANDLER_ID when env var is set", async () => {
      const resolvedHandler: ResolvedHttpHandler = {
        type: "http",
        id: "app.module.getOrder",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(async () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"orderId":"123"}',
        })),
        isFunctionHandler: true,
      };
      const registry = createMockRegistry([resolvedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"orderId":"123"}',
      });
      process.env.CELERITY_HANDLER_ID = "app.module.getOrder";
      const idAdapter = new AwsLambdaAdapter();
      const handler = idAdapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/orders/123");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(registry.getHandlerById).toHaveBeenCalledWith("http", "app.module.getOrder");
      expect(registry.getHandler).not.toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
    });

    it("falls back to path/method when CELERITY_HANDLER_ID is not set", async () => {
      const resolvedHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([resolvedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      });
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/items");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(registry.getHandlerById).not.toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith("http", "GET /items");
      expect(result.statusCode).toBe(200);
    });

    it("falls back to path/method when CELERITY_HANDLER_ID yields no match", async () => {
      const resolvedHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([resolvedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      });
      process.env.CELERITY_HANDLER_ID = "app.module.nonexistent";
      mockResolveHandlerByModuleRef.mockResolvedValue(null);
      const idAdapter = new AwsLambdaAdapter();
      const handler = idAdapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/items");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(registry.getHandlerById).toHaveBeenCalledWith("http", "app.module.nonexistent");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "app.module.nonexistent",
        "http",
        registry,
        expect.any(String),
      );
      expect(registry.getHandler).toHaveBeenCalledWith("http", "GET /items");
      expect(result.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // Module resolution fallback
  // ---------------------------------------------------------------
  describe("module resolution fallback", () => {
    afterEach(() => {
      delete process.env.CELERITY_HANDLER_ID;
      delete process.env.CELERITY_MODULE_PATH;
    });

    it("uses module resolution when handler ID lookup fails", async () => {
      process.env.CELERITY_HANDLER_ID = "handlers.greet";
      const moduleResolved: ResolvedHttpHandler = {
        type: "http",
        id: "handlers.greet",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(async () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"greeting":"hello"}',
        })),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"greeting":"hello"}',
      });

      const registry = createMockRegistry();
      const idAdapter = new AwsLambdaAdapter();
      const handler = idAdapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/greet");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(registry.getHandlerById).toHaveBeenCalledWith("http", "handlers.greet");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "handlers.greet",
        "http",
        registry,
        expect.any(String),
      );
      expect(registry.getHandler).not.toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('{"greeting":"hello"}');
    });

    it("falls through to path/method when module resolution also fails", async () => {
      process.env.CELERITY_HANDLER_ID = "handlers.missing";
      mockResolveHandlerByModuleRef.mockResolvedValue(null);

      const resolvedHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([resolvedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      });
      const idAdapter = new AwsLambdaAdapter();
      const handler = idAdapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/items");

      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      expect(registry.getHandlerById).toHaveBeenCalledWith("http", "handlers.missing");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith("http", "GET /items");
      expect(result.statusCode).toBe(200);
    });

    it("skips module resolution when no handler ID is set", async () => {
      const resolvedHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([resolvedHandler]);
      mockExecuteHttpPipeline.mockResolvedValue({ status: 200, body: "ok" });
      const handler = adapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/items");

      await handler(event, {});

      expect(mockResolveHandlerByModuleRef).not.toHaveBeenCalled();
    });

    it("caches handler resolved via module resolution", async () => {
      process.env.CELERITY_HANDLER_ID = "handlers.greet";
      const moduleResolved: ResolvedHttpHandler = {
        type: "http",
        id: "handlers.greet",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(async () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"greeting":"hello"}',
        })),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteHttpPipeline.mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"greeting":"hello"}',
      });

      const registry = createMockRegistry();
      const idAdapter = new AwsLambdaAdapter();
      const handler = idAdapter.createHttpHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/greet");

      await handler(event, {});
      await handler(event, {});

      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // Each createHttpHandler call gets its own isolated cache
  // ---------------------------------------------------------------
  describe("handler isolation", () => {
    it("each createHttpHandler call produces an independent handler with its own cache", async () => {
      const handlerA = createResolvedHandler("/a", "GET", { route: "a" });
      const handlerB = createResolvedHandler("/b", "GET", { route: "b" });
      const registryA = createMockRegistry([handlerA]);
      const registryB = createMockRegistry([handlerB]);

      mockExecuteHttpPipeline
        .mockResolvedValueOnce({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ route: "a" }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ route: "b" }),
        });

      const fnA = adapter.createHttpHandler(registryA as never, mockOptions);
      const fnB = adapter.createHttpHandler(registryB as never, mockOptions);

      const resultA = (await fnA(
        createApiGatewayEvent("GET", "/a"),
        {},
      )) as APIGatewayProxyStructuredResultV2;
      const resultB = (await fnB(
        createApiGatewayEvent("GET", "/b"),
        {},
      )) as APIGatewayProxyStructuredResultV2;

      expect(JSON.parse(resultA.body as string)).toEqual({ route: "a" });
      expect(JSON.parse(resultB.body as string)).toEqual({ route: "b" });
      expect(registryA.getHandler).toHaveBeenCalledTimes(1);
      expect(registryB.getHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // createWebSocketHandler
  // ---------------------------------------------------------------
  describe("createWebSocketHandler", () => {
    it("returns an async function", () => {
      const registry = createMockRegistry();
      const handler = adapter.createWebSocketHandler(registry as never, mockOptions);
      expect(typeof handler).toBe("function");
      expect(handler.constructor.name).toBe("AsyncFunction");
    });

    it("routes WebSocket events and returns statusCode 200", async () => {
      const resolvedWs = {
        type: "websocket" as const,
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolvedWs);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const handler = adapter.createWebSocketHandler(registry as never, mockOptions);
      const result = (await handler(createWsEvent(), {})) as Record<string, unknown>;

      expect(result.statusCode).toBe(200);
      expect(mockExecuteWebSocketPipeline).toHaveBeenCalledTimes(1);
    });

    it("registers WebSocket sender in the container on first call", async () => {
      const resolvedWs = {
        type: "websocket" as const,
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolvedWs);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const handler = adapter.createWebSocketHandler(registry as never, mockOptions);
      await handler(createWsEvent(), {});

      expect(mockContainerRegister).toHaveBeenCalledTimes(1);
      expect(mockContainerRegister).toHaveBeenCalledWith(
        Symbol.for("celerity:websocket-sender"),
        expect.objectContaining({ useValue: expect.any(Object) }),
      );

      // Second call should not re-register
      await handler(createWsEvent(), {});
      expect(mockContainerRegister).toHaveBeenCalledTimes(1);
    });

    it("returns 404 when no WebSocket handler found", async () => {
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(undefined);

      const handler = adapter.createWebSocketHandler(registry as never, mockOptions);
      const result = (await handler(createWsEvent(), {})) as Record<string, unknown>;

      expect(result.statusCode).toBe(404);
    });

    it("looks up by CELERITY_HANDLER_ID when set", async () => {
      process.env.CELERITY_HANDLER_ID = "ws-handler-1";
      const wsAdapter = new AwsLambdaAdapter();

      const resolvedWs = {
        type: "websocket" as const,
        id: "ws-handler-1",
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandlerById.mockReturnValue(resolvedWs);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const handler = wsAdapter.createWebSocketHandler(registry as never, mockOptions);
      await handler(createWsEvent(), {});

      expect(registry.getHandlerById).toHaveBeenCalledWith("websocket", "ws-handler-1");
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("caches the resolved handler for subsequent calls", async () => {
      const resolvedWs = {
        type: "websocket" as const,
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolvedWs);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const handler = adapter.createWebSocketHandler(registry as never, mockOptions);
      await handler(createWsEvent(), {});
      await handler(createWsEvent(), {});

      // getHandler only called once — cached on second call
      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("uses module resolution when handler ID lookup fails", async () => {
      process.env.CELERITY_HANDLER_ID = "ws-handlers.chat";
      const wsAdapter = new AwsLambdaAdapter();

      const moduleResolved = {
        type: "websocket" as const,
        id: "ws-handlers.chat",
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const registry = createMockRegistry();
      const handler = wsAdapter.createWebSocketHandler(registry as never, mockOptions);
      const result = (await handler(createWsEvent(), {})) as Record<string, unknown>;

      expect(registry.getHandlerById).toHaveBeenCalledWith("websocket", "ws-handlers.chat");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "ws-handlers.chat",
        "websocket",
        registry,
        expect.any(String),
      );
      expect(result.statusCode).toBe(200);
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("falls through to route lookup when module resolution returns null", async () => {
      process.env.CELERITY_HANDLER_ID = "ws-handlers.missing";
      const wsAdapter = new AwsLambdaAdapter();
      mockResolveHandlerByModuleRef.mockResolvedValue(null);

      const resolvedWs = {
        type: "websocket" as const,
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolvedWs);
      mockExecuteWebSocketPipeline.mockResolvedValue(undefined);

      const handler = wsAdapter.createWebSocketHandler(registry as never, mockOptions);
      const result = (await handler(createWsEvent(), {})) as Record<string, unknown>;

      expect(mockResolveHandlerByModuleRef).toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith("websocket", "$default");
      expect(result.statusCode).toBe(200);
      delete process.env.CELERITY_HANDLER_ID;
    });
  });

  // ---------------------------------------------------------------
  // createConsumerHandler
  // ---------------------------------------------------------------
  describe("createConsumerHandler", () => {
    afterEach(() => {
      delete process.env.CELERITY_HANDLER_TAG;
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("returns an async function", () => {
      const registry = createMockRegistry();
      const handler = adapter.createConsumerHandler(registry as never, mockOptions);
      expect(typeof handler).toBe("function");
      expect(handler.constructor.name).toBe("AsyncFunction");
    });

    it("routes SQS events and returns SQSBatchResponse", async () => {
      process.env.CELERITY_HANDLER_TAG = "orders-consumer";
      const consumerAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "consumer" as const,
        handlerTag: "orders-consumer",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });

      const handler = consumerAdapter.createConsumerHandler(registry as never, mockOptions);
      const result = (await handler(createSqsEvent(2), {})) as Record<string, unknown>;

      expect(result.batchItemFailures).toEqual([]);
      expect(mockExecuteConsumerPipeline).toHaveBeenCalledTimes(1);
    });

    it("maps partial failures to batchItemFailures", async () => {
      process.env.CELERITY_HANDLER_TAG = "orders-consumer";
      const consumerAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "consumer" as const,
        handlerTag: "orders-consumer",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteConsumerPipeline.mockResolvedValue({
        success: false,
        failures: [{ messageId: "msg-1" }],
      });

      const handler = consumerAdapter.createConsumerHandler(registry as never, mockOptions);
      const result = (await handler(createSqsEvent(3), {})) as Record<string, unknown>;

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: "msg-1" }]);
    });

    it("returns empty batchItemFailures when no handler found", async () => {
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(undefined);

      const handler = adapter.createConsumerHandler(registry as never, mockOptions);
      const result = (await handler(createSqsEvent(1), {})) as Record<string, unknown>;

      expect(result.batchItemFailures).toEqual([]);
    });

    it("derives handler tag from eventSourceARN when env var not set", async () => {
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(undefined);

      const handler = adapter.createConsumerHandler(registry as never, mockOptions);
      await handler(createSqsEvent(1), {});

      expect(registry.getHandler).toHaveBeenCalledWith(
        "consumer",
        "arn:aws:sqs:us-east-1:123:my-queue",
      );
    });

    it("caches the resolved handler for subsequent calls", async () => {
      process.env.CELERITY_HANDLER_TAG = "orders-consumer";
      const consumerAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "consumer" as const,
        handlerTag: "orders-consumer",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });

      const handler = consumerAdapter.createConsumerHandler(registry as never, mockOptions);
      await handler(createSqsEvent(1), {});
      await handler(createSqsEvent(1), {});

      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("uses module resolution when handler ID lookup fails", async () => {
      process.env.CELERITY_HANDLER_ID = "consumers.orders";
      const consumerAdapter = new AwsLambdaAdapter();

      const moduleResolved = {
        type: "consumer" as const,
        id: "consumers.orders",
        handlerTag: "orders-consumer",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });

      const registry = createMockRegistry();
      const handler = consumerAdapter.createConsumerHandler(registry as never, mockOptions);
      const result = (await handler(createSqsEvent(1), {})) as Record<string, unknown>;

      expect(registry.getHandlerById).toHaveBeenCalledWith("consumer", "consumers.orders");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "consumers.orders",
        "consumer",
        registry,
        expect.any(String),
      );
      expect(result.batchItemFailures).toEqual([]);
    });

    it("falls through to tag lookup when module resolution returns null", async () => {
      process.env.CELERITY_HANDLER_ID = "consumers.missing";
      process.env.CELERITY_HANDLER_TAG = "orders-consumer";
      const consumerAdapter = new AwsLambdaAdapter();
      mockResolveHandlerByModuleRef.mockResolvedValue(null);

      const resolved = {
        type: "consumer" as const,
        handlerTag: "orders-consumer",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteConsumerPipeline.mockResolvedValue({ success: true, failures: [] });

      const handler = consumerAdapter.createConsumerHandler(registry as never, mockOptions);
      await handler(createSqsEvent(1), {});

      expect(mockResolveHandlerByModuleRef).toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith("consumer", "orders-consumer");
    });
  });

  // ---------------------------------------------------------------
  // createScheduleHandler
  // ---------------------------------------------------------------
  describe("createScheduleHandler", () => {
    afterEach(() => {
      delete process.env.CELERITY_HANDLER_TAG;
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("returns an async function", () => {
      const registry = createMockRegistry();
      const handler = adapter.createScheduleHandler(registry as never, mockOptions);
      expect(typeof handler).toBe("function");
      expect(handler.constructor.name).toBe("AsyncFunction");
    });

    it("routes EventBridge events and returns result", async () => {
      process.env.CELERITY_HANDLER_TAG = "daily-sync";
      const schedAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "schedule" as const,
        handlerTag: "daily-sync",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteSchedulePipeline.mockResolvedValue({ success: true });

      const handler = schedAdapter.createScheduleHandler(registry as never, mockOptions);
      const result = (await handler(createEventBridgeEvent(), {})) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(mockExecuteSchedulePipeline).toHaveBeenCalledTimes(1);
    });

    it("returns error when no handler found", async () => {
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(undefined);

      const handler = adapter.createScheduleHandler(registry as never, mockOptions);
      const result = (await handler(createEventBridgeEvent(), {})) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("No handler for schedule tag");
    });

    it("derives handler tag from resources when env var not set", async () => {
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(undefined);

      const handler = adapter.createScheduleHandler(registry as never, mockOptions);
      await handler(createEventBridgeEvent(), {});

      expect(registry.getHandler).toHaveBeenCalledWith(
        "schedule",
        "arn:aws:events:us-east-1:123:rule/daily-sync",
      );
    });

    it("looks up by CELERITY_HANDLER_ID when set", async () => {
      process.env.CELERITY_HANDLER_ID = "sched-1";
      const schedAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "schedule" as const,
        id: "sched-1",
        handlerTag: "daily-sync",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandlerById.mockReturnValue(resolved);
      mockExecuteSchedulePipeline.mockResolvedValue({ success: true });

      const handler = schedAdapter.createScheduleHandler(registry as never, mockOptions);
      await handler(createEventBridgeEvent(), {});

      expect(registry.getHandlerById).toHaveBeenCalledWith("schedule", "sched-1");
    });

    it("uses module resolution when handler ID lookup fails", async () => {
      process.env.CELERITY_HANDLER_ID = "schedules.dailySync";
      const schedAdapter = new AwsLambdaAdapter();

      const moduleResolved = {
        type: "schedule" as const,
        id: "schedules.dailySync",
        handlerTag: "daily-sync",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteSchedulePipeline.mockResolvedValue({ success: true });

      const registry = createMockRegistry();
      const handler = schedAdapter.createScheduleHandler(registry as never, mockOptions);
      const result = (await handler(createEventBridgeEvent(), {})) as Record<string, unknown>;

      expect(registry.getHandlerById).toHaveBeenCalledWith("schedule", "schedules.dailySync");
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "schedules.dailySync",
        "schedule",
        registry,
        expect.any(String),
      );
      expect(result.success).toBe(true);
    });

    it("falls through to tag lookup when module resolution returns null", async () => {
      process.env.CELERITY_HANDLER_ID = "schedules.missing";
      process.env.CELERITY_HANDLER_TAG = "daily-sync";
      const schedAdapter = new AwsLambdaAdapter();
      mockResolveHandlerByModuleRef.mockResolvedValue(null);

      const resolved = {
        type: "schedule" as const,
        handlerTag: "daily-sync",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteSchedulePipeline.mockResolvedValue({ success: true });

      const handler = schedAdapter.createScheduleHandler(registry as never, mockOptions);
      await handler(createEventBridgeEvent(), {});

      expect(mockResolveHandlerByModuleRef).toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith(
        "schedule",
        "daily-sync",
      );
    });
  });

  // ---------------------------------------------------------------
  // createCustomHandler
  // ---------------------------------------------------------------
  describe("createCustomHandler", () => {
    afterEach(() => {
      delete process.env.CELERITY_HANDLER_ID;
    });

    it("returns an async function", () => {
      const registry = createMockRegistry();
      const handler = adapter.createCustomHandler(registry as never, mockOptions);
      expect(typeof handler).toBe("function");
      expect(handler.constructor.name).toBe("AsyncFunction");
    });

    it("routes custom events by CELERITY_HANDLER_ID", async () => {
      process.env.CELERITY_HANDLER_ID = "processItem";
      const customAdapter = new AwsLambdaAdapter();

      const resolved = {
        type: "custom" as const,
        name: "processItem",
        id: "processItem",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandlerById.mockReturnValue(resolved);
      mockExecuteCustomPipeline.mockResolvedValue({ result: "ok" });

      const handler = customAdapter.createCustomHandler(registry as never, mockOptions);
      const result = (await handler({ data: "test" }, {})) as Record<string, unknown>;

      expect(result.result).toBe("ok");
      expect(mockExecuteCustomPipeline).toHaveBeenCalledTimes(1);
      expect(registry.getHandlerById).toHaveBeenCalledWith("custom", "processItem");
    });

    it("extracts handlerName from event payload when no env var", async () => {
      const resolved = {
        type: "custom" as const,
        name: "doWork",
        id: "doWork",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandlerById.mockReturnValue(resolved);
      mockExecuteCustomPipeline.mockResolvedValue({ done: true });

      const handler = adapter.createCustomHandler(registry as never, mockOptions);
      const event = { handlerName: "doWork", payload: { input: 42 } };
      const result = (await handler(event, {})) as Record<string, unknown>;

      expect(result.done).toBe(true);
      expect(registry.getHandlerById).toHaveBeenCalledWith("custom", "doWork");
      expect(mockExecuteCustomPipeline).toHaveBeenCalledWith(
        resolved,
        { input: 42 },
        expect.any(Object),
      );
    });

    it("falls back to single custom handler when no ID matches", async () => {
      const resolved = {
        type: "custom" as const,
        name: "onlyHandler",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandlersByType.mockReturnValue([resolved]);
      mockExecuteCustomPipeline.mockResolvedValue({ ok: true });

      const handler = adapter.createCustomHandler(registry as never, mockOptions);
      const result = (await handler({ raw: "data" }, {})) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      expect(registry.getHandlersByType).toHaveBeenCalledWith("custom");
    });

    it("returns error when no custom handler found", async () => {
      const registry = createMockRegistry();
      registry.getHandlersByType.mockReturnValue([]);

      const handler = adapter.createCustomHandler(registry as never, mockOptions);
      const result = (await handler({ data: "test" }, {})) as Record<string, unknown>;

      expect(result.error).toContain("No handler found for custom invoke");
    });

    it("uses module resolution when handler ID lookup fails", async () => {
      process.env.CELERITY_HANDLER_ID = "tasks.processItem";
      const customAdapter = new AwsLambdaAdapter();

      const moduleResolved = {
        type: "custom" as const,
        id: "tasks.processItem",
        name: "processItem",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
        isFunctionHandler: true,
      };
      mockResolveHandlerByModuleRef.mockResolvedValue(moduleResolved);
      mockExecuteCustomPipeline.mockResolvedValue({ result: "ok" });

      const registry = createMockRegistry();
      const handler = customAdapter.createCustomHandler(registry as never, mockOptions);
      const result = (await handler({ data: "test" }, {})) as Record<string, unknown>;

      expect(registry.getHandlerById).toHaveBeenCalledWith(
        "custom",
        "tasks.processItem",
      );
      expect(mockResolveHandlerByModuleRef).toHaveBeenCalledWith(
        "tasks.processItem",
        "custom",
        registry,
        expect.any(String),
      );
      expect(result.result).toBe("ok");
    });

    it("falls through to name/single-handler lookup when module resolution returns null", async () => {
      process.env.CELERITY_HANDLER_ID = "tasks.missing";
      const customAdapter = new AwsLambdaAdapter();
      mockResolveHandlerByModuleRef.mockResolvedValue(null);

      const resolved = {
        type: "custom" as const,
        name: "onlyHandler",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn: vi.fn(),
      };
      const registry = createMockRegistry();
      registry.getHandler.mockReturnValue(resolved);
      mockExecuteCustomPipeline.mockResolvedValue({ ok: true });

      const handler = customAdapter.createCustomHandler(registry as never, mockOptions);
      const result = (await handler({ data: "test" }, {})) as Record<string, unknown>;

      expect(mockResolveHandlerByModuleRef).toHaveBeenCalled();
      expect(registry.getHandler).toHaveBeenCalledWith(
        "custom",
        "tasks.missing",
      );
      expect(result.ok).toBe(true);
    });
  });
});
