import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { datastoreToken, DEFAULT_DATASTORE_TOKEN } from "../src/decorators";

// --- Mocks ---

const mockDatastoreHandle = (name: string) => ({ __datastore: true, name });
const mockClient = {
  datastore: vi.fn((name: string) => mockDatastoreHandle(name)),
  close: vi.fn(),
};

vi.mock("../src/factory", () => ({
  createDatastoreClient: vi.fn(() => mockClient),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { DatastoreLayer } from "../src/layer";
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
                usersTable: "my-app-users-prod",
                ordersTable: "my-app-orders-prod",
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

describe("DatastoreLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.datastore.mockImplementation((name: string) => mockDatastoreHandle(name));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  it("registers DatastoreClient in the container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith("DatastoreClient", {
      useValue: mockClient,
    });
  });

  it("registers per-resource datastore handles from ConfigService", async () => {
    const links = new Map([
      ["usersTable", { type: "datastore", configKey: "usersTable" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["usersTable", "usersTable"]]),
    );

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      datastoreToken("usersTable"),
      { useValue: mockDatastoreHandle("my-app-users-prod") },
    );
  });

  it("registers a default datastore when exactly one datastore resource exists", async () => {
    const links = new Map([
      ["usersTable", { type: "datastore", configKey: "usersTable" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["usersTable", "usersTable"]]),
    );

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(DEFAULT_DATASTORE_TOKEN, {
      useValue: mockDatastoreHandle("my-app-users-prod"),
    });
  });

  it("does NOT register a default datastore when multiple datastore resources exist", async () => {
    const links = new Map([
      ["usersTable", { type: "datastore", configKey: "usersTable" }],
      ["ordersTable", { type: "datastore", configKey: "ordersTable" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["usersTable", "usersTable"],
        ["ordersTable", "ordersTable"],
      ]),
    );

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(([token]) => token === DEFAULT_DATASTORE_TOKEN);
    expect(defaultCalls).toHaveLength(0);
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new DatastoreLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    const { createDatastoreClient } = await import("../src/factory");
    expect(createDatastoreClient).toHaveBeenCalledTimes(1);
  });

  it("calls next() after initialization", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new DatastoreLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("does not resolve ConfigService when there are no datastore links", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("propagates errors from ConfigService when a config key is missing", async () => {
    const links = new Map([
      ["missingTable", { type: "datastore", configKey: "missingKey" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["missingTable", "missingKey"]]),
    );

    const container = mockContainer();
    const layer = new DatastoreLayer();

    await expect(
      layer.handle(makeContext(container), () => Promise.resolve(undefined)),
    ).rejects.toThrow('Config key "missingKey" not found');
  });

  it("resolves tracer from container when available and passes to factory", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: true });
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).toHaveBeenCalledWith("CelerityTracer");
    const { createDatastoreClient } = await import("../src/factory");
    expect(createDatastoreClient).toHaveBeenCalledWith({ tracer: mockTracer });
  });

  it("passes undefined tracer when not available in container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: false });
    const layer = new DatastoreLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("CelerityTracer");
    const { createDatastoreClient } = await import("../src/factory");
    expect(createDatastoreClient).toHaveBeenCalledWith({ tracer: undefined });
  });
});
