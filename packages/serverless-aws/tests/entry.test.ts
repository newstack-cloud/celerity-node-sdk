import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

// Mock @celerity-sdk/core
const mockGetHandler = vi.fn();
const mockGetHandlerById = vi.fn();
const mockRegistry = {
  getHandler: mockGetHandler,
  getHandlerById: mockGetHandlerById,
  getAllHandlers: vi.fn(() => []),
  scanModule: vi.fn(async () => {}),
};

const mockContainer = {
  closeAll: vi.fn().mockResolvedValue(undefined),
};

const mockBootstrap = vi.fn(async (..._args: unknown[]) => ({
  container: mockContainer,
  registry: mockRegistry,
}));

const mockDiscoverModule = vi.fn(async (..._args: unknown[]) => class TestModule {});

const mockExecuteHandlerPipeline = vi.fn();

const mockCreateDefaultSystemLayers = vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []);

vi.mock("@celerity-sdk/core", async () => {
  const actual = await vi.importActual<typeof import("@celerity-sdk/core")>("@celerity-sdk/core");
  return {
    discoverModule: (...args: unknown[]) => mockDiscoverModule(...args),
    bootstrap: (...args: unknown[]) => mockBootstrap(...args),
    executeHandlerPipeline: (...args: unknown[]) => mockExecuteHandlerPipeline(...args),
    createDefaultSystemLayers: (...args: unknown[]) => mockCreateDefaultSystemLayers(...args),
    disposeLayers: actual.disposeLayers,
  };
});

// Must re-import to get fresh module state — use dynamic import
// and reset the cached registry between tests
let handlerFn: (event: unknown, context: unknown) => Promise<APIGatewayProxyStructuredResultV2>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import the module fresh to reset cachedRegistry
  vi.resetModules();
  const entry = await import("../src/entry");
  handlerFn = entry.handler as (event: unknown, context: unknown) => Promise<APIGatewayProxyStructuredResultV2>;
});

afterEach(() => {
  delete process.env.CELERITY_MODULE_PATH;
  delete process.env.CELERITY_HANDLER_ID;
  process.removeAllListeners("SIGTERM");
});

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

describe("handler (auto-bootstrap Lambda entry)", () => {
  it("bootstraps on cold start and routes to the correct handler", async () => {
    const resolvedHandler = {
      path: "/items",
      method: "GET",
      protectedBy: [],
      layers: [],
      isPublic: true,
      paramMetadata: [],
      customMetadata: {},
      handlerFn: vi.fn(),
    };

    mockGetHandler.mockReturnValue(resolvedHandler);
    mockExecuteHandlerPipeline.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"items":[]}',
    });

    const event = makeApiGatewayEvent("GET", "/items");
    const result = await handlerFn(event, {});

    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockExecuteHandlerPipeline).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"items":[]}');
  });

  it("returns 404 when no handler matches the route", async () => {
    mockGetHandler.mockReturnValue(undefined);

    const event = makeApiGatewayEvent("GET", "/nonexistent");
    const result = await handlerFn(event, {});

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body as string);
    expect(body.message).toContain("No handler for GET /nonexistent");
  });

  it("caches bootstrap result on warm invocations", async () => {
    const resolvedHandler = {
      path: "/items",
      method: "GET",
      protectedBy: [],
      layers: [],
      isPublic: true,
      paramMetadata: [],
      customMetadata: {},
      handlerFn: vi.fn(),
    };

    mockGetHandler.mockReturnValue(resolvedHandler);
    mockExecuteHandlerPipeline.mockResolvedValue({
      status: 200,
      body: "ok",
    });

    const event = makeApiGatewayEvent("GET", "/items");

    // First invocation (cold start)
    await handlerFn(event, {});
    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);

    // Second invocation (warm)
    await handlerFn(event, {});
    // Should NOT re-bootstrap
    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
  });

  it("retries bootstrap if previous attempt failed", async () => {
    mockDiscoverModule.mockRejectedValueOnce(new Error("Module not found"));

    const event = makeApiGatewayEvent("GET", "/items");

    // First invocation fails
    await expect(handlerFn(event, {})).rejects.toThrow("Module not found");
    expect(mockDiscoverModule).toHaveBeenCalledTimes(1);

    // Second invocation should retry
    mockDiscoverModule.mockResolvedValueOnce(class TestModule {});
    mockGetHandler.mockReturnValue(undefined);

    const result = await handlerFn(event, {});
    expect(mockDiscoverModule).toHaveBeenCalledTimes(2);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(404);
  });

  it("SIGTERM disposes both container and layers", async () => {
    const order: string[] = [];
    mockContainer.closeAll.mockImplementation(async () => {
      order.push("container");
    });

    const mockLayer = {
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        order.push("layer");
      }),
    };
    mockCreateDefaultSystemLayers.mockResolvedValueOnce([mockLayer]);

    mockGetHandler.mockReturnValue(undefined);

    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    // Stub process.exit to prevent test runner from exiting
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    // Emit SIGTERM
    process.emit("SIGTERM", "SIGTERM");

    // Wait for async SIGTERM handler to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(mockContainer.closeAll).toHaveBeenCalled();
    expect(mockLayer.dispose).toHaveBeenCalled();
    expect(order).toEqual(["container", "layer"]);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it("SIGTERM continues disposing when a layer throws", async () => {
    const failingLayer = {
      init: vi.fn(),
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        throw new Error("dispose failed");
      }),
    };
    const goodLayer = {
      init: vi.fn(),
      handle: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateDefaultSystemLayers.mockResolvedValueOnce([goodLayer, failingLayer]);

    mockGetHandler.mockReturnValue(undefined);

    const event = makeApiGatewayEvent("GET", "/items");
    await handlerFn(event, {});

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    process.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 50));

    // Both layers attempted disposal (failingLayer first due to reverse order)
    expect(failingLayer.dispose).toHaveBeenCalled();
    expect(goodLayer.dispose).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it("resolves handler by CELERITY_HANDLER_ID when env var is set", async () => {
    process.env.CELERITY_HANDLER_ID = "app.module.getOrder";

    const resolvedHandler = {
      id: "app.module.getOrder",
      path: undefined,
      method: undefined,
      protectedBy: [],
      layers: [],
      isPublic: false,
      paramMetadata: [],
      customMetadata: {},
      handlerFn: vi.fn(),
      isFunctionHandler: true,
    };

    mockGetHandlerById.mockReturnValue(resolvedHandler);
    mockExecuteHandlerPipeline.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"orderId":"123"}',
    });

    const event = makeApiGatewayEvent("GET", "/orders/123");
    const result = await handlerFn(event, {});

    expect(mockGetHandlerById).toHaveBeenCalledWith("app.module.getOrder");
    expect(mockGetHandler).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"orderId":"123"}');
  });

  it("falls back to path/method when CELERITY_HANDLER_ID is not set", async () => {
    const resolvedHandler = {
      path: "/items",
      method: "GET",
      protectedBy: [],
      layers: [],
      isPublic: true,
      paramMetadata: [],
      customMetadata: {},
      handlerFn: vi.fn(),
    };

    mockGetHandler.mockReturnValue(resolvedHandler);
    mockExecuteHandlerPipeline.mockResolvedValue({
      status: 200,
      body: '{"items":[]}',
    });

    const event = makeApiGatewayEvent("GET", "/items");
    const result = await handlerFn(event, {});

    expect(mockGetHandlerById).not.toHaveBeenCalled();
    expect(mockGetHandler).toHaveBeenCalledWith("/items", "GET");
    expect(result.statusCode).toBe(200);
  });

  it("falls back to path/method when CELERITY_HANDLER_ID yields no match", async () => {
    process.env.CELERITY_HANDLER_ID = "app.module.nonexistent";

    mockGetHandlerById.mockReturnValue(undefined);

    const resolvedHandler = {
      path: "/items",
      method: "GET",
      protectedBy: [],
      layers: [],
      isPublic: true,
      paramMetadata: [],
      customMetadata: {},
      handlerFn: vi.fn(),
    };

    mockGetHandler.mockReturnValue(resolvedHandler);
    mockExecuteHandlerPipeline.mockResolvedValue({
      status: 200,
      body: '{"items":[]}',
    });

    const event = makeApiGatewayEvent("GET", "/items");
    const result = await handlerFn(event, {});

    expect(mockGetHandlerById).toHaveBeenCalledWith("app.module.nonexistent");
    expect(mockGetHandler).toHaveBeenCalledWith("/items", "GET");
    expect(result.statusCode).toBe(200);
  });
});
