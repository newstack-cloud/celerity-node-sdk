import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { queueToken, DEFAULT_QUEUE_TOKEN } from "../src/decorators";

// --- Mocks ---

const mockQueue = (name: string) => ({ __queue: true, name });
const mockQueueClient = {
  queue: vi.fn((name: string) => mockQueue(name)),
  close: vi.fn(),
};

vi.mock("../src/factory", () => ({
  createQueueClient: vi.fn(() => mockQueueClient),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { QueueLayer } from "../src/layer";
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
                ordersQueue: "https://sqs.us-east-1.amazonaws.com/123/orders",
                eventsQueue: "https://sqs.us-east-1.amazonaws.com/123/events",
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

describe("QueueLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueClient.queue.mockImplementation((name: string) => mockQueue(name));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  it("registers QueueClient in the container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith("QueueClient", {
      useValue: mockQueueClient,
    });
  });

  it("registers per-resource queue handles from ConfigService", async () => {
    const links = new Map([
      ["ordersQueue", { type: "queue", configKey: "ordersQueue" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["ordersQueue", "ordersQueue"]]),
    );

    const container = mockContainer();
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      queueToken("ordersQueue"),
      { useValue: mockQueue("https://sqs.us-east-1.amazonaws.com/123/orders") },
    );
  });

  it("registers a default queue when exactly one queue resource exists", async () => {
    const links = new Map([
      ["ordersQueue", { type: "queue", configKey: "ordersQueue" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["ordersQueue", "ordersQueue"]]),
    );

    const container = mockContainer();
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(DEFAULT_QUEUE_TOKEN, {
      useValue: mockQueue("https://sqs.us-east-1.amazonaws.com/123/orders"),
    });
  });

  it("does NOT register a default queue when multiple queue resources exist", async () => {
    const links = new Map([
      ["ordersQueue", { type: "queue", configKey: "ordersQueue" }],
      ["eventsQueue", { type: "queue", configKey: "eventsQueue" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["ordersQueue", "ordersQueue"],
        ["eventsQueue", "eventsQueue"],
      ]),
    );

    const container = mockContainer();
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(([token]) => token === DEFAULT_QUEUE_TOKEN);
    expect(defaultCalls).toHaveLength(0);
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new QueueLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    // createQueueClient called only once
    const { createQueueClient } = await import("../src/factory");
    expect(createQueueClient).toHaveBeenCalledTimes(1);
  });

  it("calls next() after initialization", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new QueueLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("does not resolve ConfigService when there are no queue links", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("propagates errors from ConfigService when a config key is missing", async () => {
    const links = new Map([
      ["missingQueue", { type: "queue", configKey: "missingKey" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["missingQueue", "missingKey"]]),
    );

    const container = mockContainer();
    const layer = new QueueLayer();

    await expect(
      layer.handle(makeContext(container), () => Promise.resolve(undefined)),
    ).rejects.toThrow('Config key "missingKey" not found');
  });

  it("resolves tracer from container when available and passes to factory", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: true });
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).toHaveBeenCalledWith("CelerityTracer");
    const { createQueueClient } = await import("../src/factory");
    expect(createQueueClient).toHaveBeenCalledWith({ tracer: mockTracer });
  });

  it("passes undefined tracer when not available in container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: false });
    const layer = new QueueLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("CelerityTracer");
    const { createQueueClient } = await import("../src/factory");
    expect(createQueueClient).toHaveBeenCalledWith({ tracer: undefined });
  });
});
