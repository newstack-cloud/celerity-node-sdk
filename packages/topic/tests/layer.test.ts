import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { topicToken, DEFAULT_TOPIC_TOKEN } from "../src/decorators";

// --- Mocks ---

const mockTopic = (name: string) => ({ __topic: true, name });
const mockTopicClient = {
  topic: vi.fn((name: string) => mockTopic(name)),
  close: vi.fn(),
};

vi.mock("../src/factory", () => ({
  createTopicClient: vi.fn(() => mockTopicClient),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { TopicLayer } from "../src/layer";
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
                orderEvents: "arn:aws:sns:us-east-1:123:order-events",
                auditEvents: "arn:aws:sns:us-east-1:123:audit-events",
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

describe("TopicLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicClient.topic.mockImplementation((name: string) => mockTopic(name));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  it("registers TopicClient in the container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith("TopicClient", {
      useValue: mockTopicClient,
    });
  });

  it("registers per-resource topic handles from ConfigService", async () => {
    const links = new Map([
      ["orderEvents", { type: "topic", configKey: "orderEvents" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["orderEvents", "orderEvents"]]),
    );

    const container = mockContainer();
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      topicToken("orderEvents"),
      { useValue: mockTopic("arn:aws:sns:us-east-1:123:order-events") },
    );
  });

  it("registers a default topic when exactly one topic resource exists", async () => {
    const links = new Map([
      ["orderEvents", { type: "topic", configKey: "orderEvents" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["orderEvents", "orderEvents"]]),
    );

    const container = mockContainer();
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(DEFAULT_TOPIC_TOKEN, {
      useValue: mockTopic("arn:aws:sns:us-east-1:123:order-events"),
    });
  });

  it("does NOT register a default topic when multiple topic resources exist", async () => {
    const links = new Map([
      ["orderEvents", { type: "topic", configKey: "orderEvents" }],
      ["auditEvents", { type: "topic", configKey: "auditEvents" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["orderEvents", "orderEvents"],
        ["auditEvents", "auditEvents"],
      ]),
    );

    const container = mockContainer();
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(([token]) => token === DEFAULT_TOPIC_TOKEN);
    expect(defaultCalls).toHaveLength(0);
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new TopicLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    const { createTopicClient } = await import("../src/factory");
    expect(createTopicClient).toHaveBeenCalledTimes(1);
  });

  it("calls next() after initialization", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new TopicLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("does not resolve ConfigService when there are no topic links", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("propagates errors from ConfigService when a config key is missing", async () => {
    const links = new Map([
      ["missingTopic", { type: "topic", configKey: "missingKey" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([["missingTopic", "missingKey"]]),
    );

    const container = mockContainer();
    const layer = new TopicLayer();

    await expect(
      layer.handle(makeContext(container), () => Promise.resolve(undefined)),
    ).rejects.toThrow('Config key "missingKey" not found');
  });

  it("resolves tracer from container when available and passes to factory", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: true });
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).toHaveBeenCalledWith("CelerityTracer");
    const { createTopicClient } = await import("../src/factory");
    expect(createTopicClient).toHaveBeenCalledWith({ tracer: mockTracer });
  });

  it("passes undefined tracer when not available in container", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer({ hasTracer: false });
    const layer = new TopicLayer();

    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("CelerityTracer");
    const { createTopicClient } = await import("../src/factory");
    expect(createTopicClient).toHaveBeenCalledWith({ tracer: undefined });
  });
});
