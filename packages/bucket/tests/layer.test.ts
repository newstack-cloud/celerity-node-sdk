import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { bucketToken, DEFAULT_BUCKET_TOKEN } from "../src/decorators";

// --- Mocks ---

const mockBucket = (name: string) => ({ __bucket: true, name });
const mockStorage = {
  bucket: vi.fn((name: string) => mockBucket(name)),
  close: vi.fn(),
};

vi.mock("../src/factory", () => ({
  createObjectStorage: vi.fn(() => Promise.resolve(mockStorage)),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { ObjectStorageLayer } from "../src/layer";
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
            getOrThrow: vi.fn().mockImplementation((key: string) => {
              const values: Record<string, string> = {
                imagesBucket: "my-app-images-prod",
                archiveBucket: "my-app-archive-prod",
              };
              if (values[key]) return Promise.resolve(values[key]);
              return Promise.reject(new Error(`Config key "${key}" not found`));
            }),
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

describe("ObjectStorageLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.bucket.mockImplementation((name: string) => mockBucket(name));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  it("registers ObjectStorage in the container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith("ObjectStorage", {
      useValue: mockStorage,
    });
  });

  it("registers per-resource bucket handles from ConfigService", async () => {
    const links = new Map([
      ["imagesBucket", { type: "bucket", configKey: "imagesBucket" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["imagesBucket", "imagesBucket"]]),
    );

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      bucketToken("imagesBucket"),
      { useValue: mockBucket("my-app-images-prod") },
    );
  });

  it("registers a default bucket when exactly one bucket resource exists", async () => {
    const links = new Map([
      ["imagesBucket", { type: "bucket", configKey: "imagesBucket" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["imagesBucket", "imagesBucket"]]),
    );

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(DEFAULT_BUCKET_TOKEN, {
      useValue: mockBucket("my-app-images-prod"),
    });
  });

  it("does NOT register a default bucket when multiple bucket resources exist", async () => {
    const links = new Map([
      ["imagesBucket", { type: "bucket", configKey: "imagesBucket" }],
      ["archiveBucket", { type: "bucket", configKey: "archiveBucket" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["imagesBucket", "imagesBucket"],
        ["archiveBucket", "archiveBucket"],
      ]),
    );

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(([token]) => token === DEFAULT_BUCKET_TOKEN);
    expect(defaultCalls).toHaveLength(0);
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new ObjectStorageLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    // createObjectStorage called only once
    const { createObjectStorage } = await import("../src/factory");
    expect(createObjectStorage).toHaveBeenCalledTimes(1);
  });

  it("calls next() after initialization", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new ObjectStorageLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("does not resolve ConfigService when there are no bucket links", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("propagates errors from ConfigService when a config key is missing", async () => {
    const links = new Map([
      ["missingBucket", { type: "bucket", configKey: "missingKey" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["missingBucket", "missingKey"]]),
    );

    const container = mockContainer();
    const layer = new ObjectStorageLayer();

    await expect(
      layer.handle(makeContext(container), () => Promise.resolve(undefined)),
    ).rejects.toThrow('Config key "missingKey" not found');
  });

  it("resolves tracer from container when available and passes to factory", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: true });
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).toHaveBeenCalledWith("CelerityTracer");
    const { createObjectStorage } = await import("../src/factory");
    expect(createObjectStorage).toHaveBeenCalledWith({ tracer: mockTracer });
  });

  it("passes undefined tracer when not available in container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: false });
    const layer = new ObjectStorageLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("CelerityTracer");
    const { createObjectStorage } = await import("../src/factory");
    expect(createObjectStorage).toHaveBeenCalledWith({ tracer: undefined });
  });
});
