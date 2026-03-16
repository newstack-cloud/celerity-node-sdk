import { describe, it, expect, vi, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { ConfigLayer } from "../src/config-layer";

function createMockContext(): BaseHandlerContext {
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
    const expectedResponse = { status: 200, body: "ok" };
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

  it("should discover STORE_PREFIX and use it as namespace name", async () => {
    process.env.CELERITY_CONFIG_RESOURCES_STORE_ID = "projects/x/secrets/myapp-config";
    process.env.CELERITY_CONFIG_RESOURCES_STORE_KIND = "secret-manager";
    process.env.CELERITY_CONFIG_RESOURCES_STORE_PREFIX = "resources";
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_ID = "projects/x/secrets/myapp-config";
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_KIND = "secret-manager";
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_PREFIX = "appConfig";
    process.env.CELERITY_PLATFORM = "local";

    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    const registered = (context.container.register as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const configService = registered.useValue;
    // Namespace names come from STORE_PREFIX values
    expect(() => configService.namespace("resources")).not.toThrow();
    expect(() => configService.namespace("appConfig")).not.toThrow();
  });

  it("should use NAMESPACE env var as namespace name when set", async () => {
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_ID = "appConfig";
    process.env.CELERITY_CONFIG_APPCONFIG_NAMESPACE = "appConfig";
    process.env.CELERITY_PLATFORM = "local";

    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    const registered = (context.container.register as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const configService = registered.useValue;
    expect(() => configService.namespace("appConfig")).not.toThrow();
  });

  it("should prefer NAMESPACE over STORE_PREFIX for namespace name", async () => {
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_ID = "projects/x/secrets/myapp";
    process.env.CELERITY_CONFIG_APPCONFIG_STORE_PREFIX = "/prod/myservice/appConfig";
    process.env.CELERITY_CONFIG_APPCONFIG_NAMESPACE = "appConfig";
    process.env.CELERITY_PLATFORM = "local";

    const layer = new ConfigLayer();
    const context = createMockContext();
    const next = vi.fn().mockResolvedValue({ status: 200 });

    await layer.handle(context, next);

    const registered = (context.container.register as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const configService = registered.useValue;
    // NAMESPACE takes precedence over STORE_PREFIX for the DI name
    expect(() => configService.namespace("appConfig")).not.toThrow();
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
