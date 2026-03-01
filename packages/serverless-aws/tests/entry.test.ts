import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// ---------------------------------------------------------------------------
// Mocks — CelerityFactory.create returns a mock ServerlessApplication
// ---------------------------------------------------------------------------

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockCreateHandler = vi.fn();
const mockApp = {
  createHandler: mockCreateHandler,
  close: mockClose,
};

const mockDiscoverModule = vi.fn(async (..._args: unknown[]) => class TestModule {});
const mockFactoryCreate = vi.fn(async (..._args: unknown[]) => mockApp);

vi.mock("@celerity-sdk/core", () => ({
  discoverModule: (...args: unknown[]) => mockDiscoverModule(...args),
  CelerityFactory: { create: (...args: unknown[]) => mockFactoryCreate(...args) },
  ServerlessApplication: class MockServerlessApplication {},
}));

// Must re-import to get fresh module state — dynamic import resets cached
// module-level variables (app, cachedHandler, shutdownRegistered)
let handlerFn: (event: unknown, context: unknown) => Promise<unknown>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  // Restore default implementations after clearAllMocks
  mockFactoryCreate.mockResolvedValue(mockApp);
  mockDiscoverModule.mockResolvedValue(class TestModule {});
  mockCreateHandler.mockReturnValue(vi.fn().mockResolvedValue({ statusCode: 200 }));

  const entry = await import("../src/entry");
  handlerFn = entry.handler;
});

afterEach(() => {
  delete process.env.CELERITY_HANDLER_TYPE;
  process.removeAllListeners("SIGTERM");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiGatewayEvent(
  method: string,
  path: string,
  overrides: Record<string, unknown> = {},
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test-agent",
      },
      requestId: "req-123",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "2026-01-01T00:00:00Z",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

function makeWsEvent(overrides: Record<string, unknown> = {}) {
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

function makeSqsEvent(recordCount = 1) {
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

function makeEventBridgeEvent(overrides: Record<string, unknown> = {}) {
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

// ---------------------------------------------------------------------------
// Bootstrap lifecycle
// ---------------------------------------------------------------------------

describe("bootstrap lifecycle", () => {
  it("calls discoverModule and CelerityFactory.create on cold start", async () => {
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);
    expect(mockFactoryCreate).toHaveBeenCalledTimes(1);
    expect(mockFactoryCreate).toHaveBeenCalledWith(
      expect.any(Function), // root module class
      expect.objectContaining({ adapter: expect.any(Object) }),
    );
  });

  it("caches the app on warm invocations (no re-bootstrap)", async () => {
    const event = makeApiGatewayEvent("GET", "/items");

    await handlerFn(event, {});
    await handlerFn(event, {});

    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);
    expect(mockFactoryCreate).toHaveBeenCalledTimes(1);
  });

  it("retries bootstrap if discoverModule failed", async () => {
    mockDiscoverModule.mockRejectedValueOnce(new Error("Module not found"));

    const event = makeApiGatewayEvent("GET", "/items");
    await expect(handlerFn(event, {})).rejects.toThrow("Module not found");

    // Second invocation should retry bootstrap
    mockDiscoverModule.mockResolvedValueOnce(class TestModule {});
    await handlerFn(event, {});

    expect(mockDiscoverModule).toHaveBeenCalledTimes(2);
    expect(mockFactoryCreate).toHaveBeenCalledTimes(1);
  });

  it("retries bootstrap if CelerityFactory.create failed", async () => {
    mockFactoryCreate.mockRejectedValueOnce(new Error("Factory failed"));

    const event = makeApiGatewayEvent("GET", "/items");
    await expect(handlerFn(event, {})).rejects.toThrow("Factory failed");

    // Second invocation retries
    mockFactoryCreate.mockResolvedValueOnce(mockApp);
    await handlerFn(event, {});

    expect(mockFactoryCreate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Handler creation and caching
// ---------------------------------------------------------------------------

describe("handler creation and caching", () => {
  it("calls app.createHandler on first invocation", async () => {
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateHandler).toHaveBeenCalledWith("http");
  });

  it("caches the handler across invocations", async () => {
    const event = makeApiGatewayEvent("GET", "/items");

    await handlerFn(event, {});
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledTimes(1);
  });

  it("passes event and context to the created handler", async () => {
    const mockHandler = vi.fn().mockResolvedValue({ statusCode: 200 });
    mockCreateHandler.mockReturnValue(mockHandler);

    const event = makeApiGatewayEvent("GET", "/items");
    const context = { functionName: "test" };
    await handlerFn(event, context);

    expect(mockHandler).toHaveBeenCalledWith(event, context);
  });

  it("returns the created handler's result", async () => {
    const expectedResult = { statusCode: 200, body: '{"ok":true}' };
    const mockHandler = vi.fn().mockResolvedValue(expectedResult);
    mockCreateHandler.mockReturnValue(mockHandler);

    const event = makeApiGatewayEvent("GET", "/items");
    const result = await handlerFn(event, {});

    expect(result).toEqual(expectedResult);
  });
});

// ---------------------------------------------------------------------------
// Event type dispatch
// ---------------------------------------------------------------------------

describe("event type dispatch", () => {
  it("detects HTTP from API Gateway v2 event shape", async () => {
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("http");
  });

  it("detects WebSocket from event shape", async () => {
    const event = makeWsEvent();
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("websocket");
  });

  it("detects consumer from SQS event shape", async () => {
    const event = makeSqsEvent(1);
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("consumer");
  });

  it("detects schedule from EventBridge event shape", async () => {
    const event = makeEventBridgeEvent();
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("schedule");
  });

  it("falls back to custom for unknown event shapes", async () => {
    const event = { data: "test" };
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("custom");
  });

  it("uses CELERITY_HANDLER_TYPE env var over event shape detection", async () => {
    process.env.CELERITY_HANDLER_TYPE = "consumer";

    // Even though this is an HTTP-shaped event, env var wins
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("consumer");
  });

  it("dispatches websocket via CELERITY_HANDLER_TYPE", async () => {
    process.env.CELERITY_HANDLER_TYPE = "websocket";

    const event = makeWsEvent();
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("websocket");
  });

  it("dispatches schedule via CELERITY_HANDLER_TYPE", async () => {
    process.env.CELERITY_HANDLER_TYPE = "schedule";

    const event = makeEventBridgeEvent();
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("schedule");
  });

  it("dispatches custom via CELERITY_HANDLER_TYPE", async () => {
    process.env.CELERITY_HANDLER_TYPE = "custom";

    const event = { data: "test" };
    await handlerFn(event, {});

    expect(mockCreateHandler).toHaveBeenCalledWith("custom");
  });
});

// ---------------------------------------------------------------------------
// SIGTERM shutdown
// ---------------------------------------------------------------------------

describe("SIGTERM shutdown", () => {
  it("calls app.close() and process.exit(0) on SIGTERM", async () => {
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it("registers SIGTERM handler only once across invocations", async () => {
    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});
    await handlerFn(event, {});

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 50));

    // close called once even though handler was invoked twice
    expect(mockClose).toHaveBeenCalledTimes(1);

    exitSpy.mockRestore();
  });
});
