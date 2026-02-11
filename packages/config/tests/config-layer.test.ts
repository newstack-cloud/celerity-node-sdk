import { describe, it, expect, vi, afterEach } from "vitest";
import type { HandlerContext, HandlerResponse, ServiceContainer } from "@celerity-sdk/types";
import { ConfigLayer } from "../src/config-layer";

function createMockContext(): HandlerContext {
  const providers = new Map<unknown, unknown>();
  const container: ServiceContainer = {
    register: vi.fn((token, provider) => {
      const value = "useValue" in provider ? provider.useValue : provider;
      providers.set(token, value);
    }),
    resolve: vi.fn(async (token) => providers.get(token)) as ServiceContainer["resolve"],
    has: vi.fn((token) => providers.has(token)),
    closeAll: vi.fn().mockResolvedValue(undefined),
  };

  return {
    request: {
      method: "GET",
      path: "/test",
      pathParams: {},
      query: {},
      headers: {},
      cookies: {},
      textBody: null,
      binaryBody: null,
      contentType: null,
      requestId: "test-id",
      requestTime: new Date().toISOString(),
      auth: null,
      clientIp: "127.0.0.1",
      traceContext: null,
      userAgent: "test",
      matchedRoute: null,
    },
    metadata: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
    },
    container,
  };
}

describe("ConfigLayer", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should call next() and return its response", async () => {
    const layer = new ConfigLayer();
    const context = createMockContext();
    const expectedResponse: HandlerResponse = { status: 200, body: "ok" };
    const next = vi.fn().mockResolvedValue(expectedResponse);

    const result = await layer.handle(context, next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe(expectedResponse);
  });

  it("should register ConfigService in the container on first request", async () => {
    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    expect(context.container.register).toHaveBeenCalledOnce();
    expect(context.container.register).toHaveBeenCalledWith(
      "ConfigService",
      expect.objectContaining({ useValue: expect.anything() }),
    );
  });

  it("should only initialize once across multiple requests", async () => {
    const layer = new ConfigLayer();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    const context1 = createMockContext();
    const context2 = createMockContext();

    await layer.handle(context1, next);
    await layer.handle(context2, next);

    // First request registers, second does not
    expect(context1.container.register).toHaveBeenCalledOnce();
    expect(context2.container.register).not.toHaveBeenCalled();
  });

  it("should register ConfigService with no namespaces when no env vars set", async () => {
    delete process.env.CELERITY_CONFIG_STORE_ID;
    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    const registered = (context.container.register as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const configService = registered.useValue;
    expect(configService).toBeDefined();
  });

  it("should configure a default namespace when CELERITY_CONFIG_STORE_ID is set", async () => {
    process.env.CELERITY_CONFIG_STORE_ID = "arn:aws:secretsmanager:us-east-1:123:secret:my-secret";
    process.env.CELERITY_CONFIG_STORE_KIND = "secrets-manager";
    process.env.CELERITY_PLATFORM = "local";

    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    const registered = (context.container.register as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const configService = registered.useValue;
    // Should have a "default" namespace
    expect(() => configService.namespace("default")).not.toThrow();
  });
});
