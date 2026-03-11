import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { cacheToken, cacheCredentialsToken, cacheClientToken, DEFAULT_CACHE_TOKEN, DEFAULT_CACHE_CREDENTIALS_TOKEN } from "../src/decorators";

// --- Mocks ---

const mockCache = (name: string) => ({ __cache: true, name });
const mockCredentials = (_name: string) => ({
  getConnectionInfo: vi.fn().mockResolvedValue({
    host: "redis.example.com",
    port: 6379,
    tls: true,
    clusterMode: false,
    authMode: "password",
    keyPrefix: "",
  }),
  getPasswordAuth: vi.fn().mockResolvedValue({ authToken: "secret" }),
  getIamAuth: vi.fn(),
});

const mockCacheClient = {
  cache: vi.fn((name: string) => mockCache(name)),
  close: vi.fn(),
};

vi.mock("../src/factory", () => ({
  createCacheClient: vi.fn(() => mockCacheClient),
}));

vi.mock("../src/credentials", () => ({
  resolveCacheCredentials: vi.fn((_configKey: string) => Promise.resolve(mockCredentials(_configKey))),
}));

vi.mock("../src/config", () => ({
  captureCacheLayerConfig: vi.fn(() => ({ deployTarget: "functions", platform: "aws" })),
  resolveConnectionOverrides: vi.fn(() => Promise.resolve({})),
  resolveConnectionConfig: vi.fn(() => ({
    connectTimeoutMs: 5000,
    commandTimeoutMs: 5000,
    keepAliveMs: 0,
    maxRetries: 2,
    retryDelayMs: 100,
    lazyConnect: true,
  })),
  resolveTokenProviderFactory: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { CacheLayer } from "../src/layer";
import { captureResourceLinks, getLinksOfType } from "@celerity-sdk/config";

const mockedCaptureResourceLinks = vi.mocked(captureResourceLinks);
const mockedGetLinksOfType = vi.mocked(getLinksOfType);

// --- Helpers ---

const mockTracer = { startSpan: vi.fn(), withSpan: vi.fn() };

function mockContainer(
  opts?: { hasTracer?: boolean },
): ServiceContainer & { registered: Map<unknown, unknown> } {
  const registered = new Map<unknown, unknown>();
  return {
    registered,
    resolve: vi.fn().mockImplementation((token: unknown) => {
      if (token === "ConfigService") {
        return Promise.resolve({
          namespace: () => ({
            get: vi.fn().mockResolvedValue(undefined),
            getOrThrow: vi.fn().mockResolvedValue("value"),
          }),
        });
      }
      if (token === "CelerityTracer") return Promise.resolve(mockTracer);
      return Promise.resolve(registered.get(token));
    }),
    register: vi.fn().mockImplementation((_token: unknown, provider: { useValue: unknown }) => {
      registered.set(_token, provider.useValue);
    }),
    has: vi.fn().mockImplementation((token: unknown) => {
      if (token === "CelerityTracer") return opts?.hasTracer ?? false;
      return false;
    }),
    closeAll: vi.fn(),
  };
}

function makeContext(container: ServiceContainer): BaseHandlerContext {
  return { container, metadata: new Map() };
}

// --- Tests ---

describe("CacheLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheClient.cache.mockImplementation((name: string) => mockCache(name));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  it("does nothing when there are no cache links", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("registers per-resource cache, credentials, and client tokens", async () => {
    const links = new Map([
      ["sessionCache", { type: "cache", configKey: "sessionCache" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["sessionCache", "sessionCache"]]),
    );

    const container = mockContainer();
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      cacheToken("sessionCache"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      cacheCredentialsToken("sessionCache"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      cacheClientToken("sessionCache"),
      expect.objectContaining({ useValue: mockCacheClient, onClose: expect.any(Function) }),
    );
  });

  it("registers default tokens when exactly one cache resource exists", async () => {
    const links = new Map([
      ["sessionCache", { type: "cache", configKey: "sessionCache" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["sessionCache", "sessionCache"]]),
    );

    const container = mockContainer();
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_CACHE_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_CACHE_CREDENTIALS_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
  });

  it("does NOT register default tokens when multiple cache resources exist", async () => {
    const links = new Map([
      ["sessionCache", { type: "cache", configKey: "sessionCache" }],
      ["rateLimitCache", { type: "cache", configKey: "rateLimitCache" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["sessionCache", "sessionCache"],
        ["rateLimitCache", "rateLimitCache"],
      ]),
    );

    const container = mockContainer();
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(([token]) => token === DEFAULT_CACHE_TOKEN);
    expect(defaultCalls).toHaveLength(0);
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new CacheLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    const { captureCacheLayerConfig } = await import("../src/config");
    expect(captureCacheLayerConfig).toHaveBeenCalledTimes(1);
  });

  it("calls next() after initialization", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new CacheLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("resolves tracer from container when available", async () => {
    const links = new Map([
      ["sessionCache", { type: "cache", configKey: "sessionCache" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["sessionCache", "sessionCache"]]),
    );

    const container = mockContainer({ hasTracer: true });
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).toHaveBeenCalledWith("CelerityTracer");
  });

  it("does not resolve tracer when not available in container", async () => {
    const links = new Map([
      ["sessionCache", { type: "cache", configKey: "sessionCache" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["sessionCache", "sessionCache"]]),
    );

    const container = mockContainer({ hasTracer: false });
    const layer = new CacheLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("CelerityTracer");
  });
});
