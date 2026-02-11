import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  CelerityLogger,
  HandlerContext,
  HandlerResponse,
  HttpRequest,
  ServiceContainer,
} from "@celerity-sdk/types";
import { LOGGER_TOKEN, TRACER_TOKEN } from "../src/tokens";
import { getRequestLogger } from "../src/request-context";

// Mock OTel API
vi.mock("@opentelemetry/api", () => ({
  context: {
    with: vi.fn((_ctx, fn) => fn()),
  },
}));

// Mock init
vi.mock("../src/init", () => ({
  initTelemetry: vi.fn().mockResolvedValue(undefined),
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
}));

// Mock context extraction
vi.mock("../src/context", () => ({
  extractTraceContext: vi.fn().mockReturnValue({}),
}));

// Track created logger and mock setLevel
const mockSetLevel = vi.fn();
const mockPinoChild = vi.fn();

vi.mock("../src/logger", () => {
  return {
    CelerityLoggerImpl: vi.fn(),
    createLogger: vi.fn().mockImplementation(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: mockSetLevel,
      child: mockPinoChild.mockImplementation((name: string, attrs?: Record<string, unknown>) => ({
        _name: name,
        ...attrs,
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
        withContext: vi.fn(),
      })),
      withContext: vi.fn(),
    })),
  };
});

// Import after mocks
const { TelemetryLayer } = await import("../src/telemetry-layer");
const { initTelemetry, shutdownTelemetry } = await import("../src/init");

function createMockRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    path: "/users",
    pathParams: {},
    query: {},
    headers: {},
    cookies: {},
    textBody: null,
    binaryBody: null,
    contentType: null,
    requestId: "req-123",
    requestTime: new Date().toISOString(),
    auth: null,
    clientIp: "127.0.0.1",
    traceContext: null,
    userAgent: "TestAgent/1.0",
    matchedRoute: "/users",
    ...overrides,
  };
}

function createMockContainer(): ServiceContainer & {
  _registry: Map<string, unknown>;
} {
  const registry = new Map<string, unknown>();
  return {
    _registry: registry,
    register: vi.fn((token: string, provider: { useValue: unknown }) => {
      registry.set(token, provider.useValue);
    }) as unknown as ServiceContainer["register"],
    resolve: vi.fn(async (token: string) => registry.get(token)) as unknown as ServiceContainer["resolve"],
    has: vi.fn((token: string) => registry.has(token)),
    closeAll: vi.fn().mockResolvedValue(undefined),
  };
}

function createHandlerContext(
  overrides: Partial<HandlerContext> = {},
): HandlerContext & { container: ReturnType<typeof createMockContainer> } {
  const container = createMockContainer();
  return {
    request: createMockRequest(),
    metadata: {
      handlerName: "TestHandler",
      method: "GET",
      path: "/users",
      guards: [],
    },
    container,
    ...overrides,
  } as HandlerContext & { container: ReturnType<typeof createMockContainer> };
}

describe("TelemetryLayer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CELERITY_TELEMETRY_ENABLED;
    delete process.env.CELERITY_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should register logger and tracer in container on first request", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext();
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    expect(context.container.register).toHaveBeenCalledWith(
      LOGGER_TOKEN,
      expect.objectContaining({ useValue: expect.anything() }),
    );
    expect(context.container.register).toHaveBeenCalledWith(
      TRACER_TOKEN,
      expect.objectContaining({ useValue: expect.anything() }),
    );
  });

  it("should set context.logger to a request-scoped child logger", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext();
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    expect(context.logger).toBeDefined();
    expect(mockPinoChild).toHaveBeenCalledWith("request", {
      requestId: "req-123",
      method: "GET",
      path: "/users",
      matchedRoute: "/users",
      clientIp: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });
  });

  it("should extract userId from JWT guard claims.sub", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext({
      request: createMockRequest({
        auth: { jwt: { claims: { sub: "user-42", aud: "my-app" } } },
      }),
    });
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    expect(mockPinoChild).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ userId: "user-42" }),
    );
  });

  it("should extract userId from custom guard userId field", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext({
      request: createMockRequest({
        auth: { customGuard: { userId: "104932", role: "admin" } },
      }),
    });
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    expect(mockPinoChild).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ userId: "104932" }),
    );
  });

  it("should prefer JWT claims.sub over custom guard fields in multi-guard auth", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext({
      request: createMockRequest({
        auth: {
          jwt: { claims: { sub: "jwt-user" } },
          customGuard: { userId: "custom-user" },
        },
      }),
    });
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    expect(mockPinoChild).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ userId: "jwt-user" }),
    );
  });

  it("should omit userId when auth is null", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext({
      request: createMockRequest({ auth: null }),
    });
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    const attrs = mockPinoChild.mock.calls[0]![1];
    expect(attrs).not.toHaveProperty("userId");
  });

  it("should omit userId when no guard result contains a user identifier", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext({
      request: createMockRequest({
        auth: { apiKey: { key: "abc123" } },
      }),
    });
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    await layer.handle(context, next);

    const attrs = mockPinoChild.mock.calls[0]![1];
    expect(attrs).not.toHaveProperty("userId");
  });

  it("should make request-scoped logger available via getRequestLogger() in handler", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext();
    let capturedLogger: CelerityLogger | undefined;

    const next = vi.fn().mockImplementation(async () => {
      capturedLogger = getRequestLogger();
      return { status: 200, headers: {}, body: null };
    });

    await layer.handle(context, next);

    expect(capturedLogger).toBeDefined();
    expect(capturedLogger).toBe(context.logger);
  });

  it("should call next() and return its response", async () => {
    const layer = new TelemetryLayer();
    const context = createHandlerContext();
    const response: HandlerResponse = { status: 201, headers: { "x-id": "1" }, body: "ok" };
    const next = vi.fn().mockResolvedValue(response);

    const result = await layer.handle(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe(response);
  });

  it("should register DI only once across multiple requests", async () => {
    const layer = new TelemetryLayer();
    const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

    const context1 = createHandlerContext();
    await layer.handle(context1, next);

    const context2 = createHandlerContext();
    await layer.handle(context2, next);

    // createLogger called only once (the mock is called during first handle)
    const { createLogger } = await import("../src/logger");
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it("should not start OTel init when tracing is disabled", () => {
    new TelemetryLayer();
    expect(initTelemetry).not.toHaveBeenCalled();
  });

  it("should start OTel init when tracing is enabled", () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    new TelemetryLayer();
    expect(initTelemetry).toHaveBeenCalledTimes(1);
  });

  it("should call shutdownTelemetry on dispose when tracing is enabled", async () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    const layer = new TelemetryLayer();
    await layer.dispose();
    expect(shutdownTelemetry).toHaveBeenCalledTimes(1);
  });

  it("should not call shutdownTelemetry on dispose when tracing is disabled", async () => {
    const layer = new TelemetryLayer();
    await layer.dispose();
    expect(shutdownTelemetry).not.toHaveBeenCalled();
  });

  describe("dynamic log level refresh", () => {
    it("should skip refresh when ConfigService is not registered", async () => {
      const layer = new TelemetryLayer();
      const context = createHandlerContext();
      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

      // container.has("ConfigService") returns false by default
      await layer.handle(context, next);

      expect(mockSetLevel).not.toHaveBeenCalled();
    });

    it("should refresh log level from ConfigService", async () => {
      const layer = new TelemetryLayer();
      const context = createHandlerContext();

      // Register a mock ConfigService
      const mockConfigService = {
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === "CELERITY_LOG_LEVEL") return "debug";
          return undefined;
        }),
      };
      context.container._registry.set("ConfigService", mockConfigService);

      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });
      await layer.handle(context, next);

      expect(mockSetLevel).toHaveBeenCalledWith("debug");
    });

    it("should try all key variants", async () => {
      const layer = new TelemetryLayer();
      const context = createHandlerContext();

      const mockConfigService = {
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === "celerity_log_level") return "warn";
          return undefined;
        }),
      };
      context.container._registry.set("ConfigService", mockConfigService);

      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });
      await layer.handle(context, next);

      expect(mockSetLevel).toHaveBeenCalledWith("warn");
      // Should have checked CELERITY_LOG_LEVEL and celerityLogLevel before finding celerity_log_level
      expect(mockConfigService.get).toHaveBeenCalledWith("CELERITY_LOG_LEVEL");
      expect(mockConfigService.get).toHaveBeenCalledWith("celerityLogLevel");
      expect(mockConfigService.get).toHaveBeenCalledWith("celerity_log_level");
    });

    it("should not update level when config returns same value", async () => {
      process.env.CELERITY_LOG_LEVEL = "info";
      const layer = new TelemetryLayer();
      const context = createHandlerContext();

      const mockConfigService = {
        get: vi.fn().mockResolvedValue("info"),
      };
      context.container._registry.set("ConfigService", mockConfigService);

      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });
      await layer.handle(context, next);

      expect(mockSetLevel).not.toHaveBeenCalled();
    });

    it("should ignore invalid log levels from config", async () => {
      const layer = new TelemetryLayer();
      const context = createHandlerContext();

      const mockConfigService = {
        get: vi.fn().mockResolvedValue("verbose"), // not a valid level
      };
      context.container._registry.set("ConfigService", mockConfigService);

      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });
      await layer.handle(context, next);

      expect(mockSetLevel).not.toHaveBeenCalled();
    });

    it("should gracefully handle ConfigService errors", async () => {
      const layer = new TelemetryLayer();
      const context = createHandlerContext();

      const mockConfigService = {
        get: vi.fn().mockRejectedValue(new Error("config error")),
      };
      context.container._registry.set("ConfigService", mockConfigService);

      const next = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: null });

      // Should not throw
      await expect(layer.handle(context, next)).resolves.toBeDefined();
      expect(mockSetLevel).not.toHaveBeenCalled();
    });
  });
});

