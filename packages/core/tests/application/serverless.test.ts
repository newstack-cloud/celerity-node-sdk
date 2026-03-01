import { describe, it, expect, vi } from "vitest";
import { ServerlessApplication } from "../../src/application/serverless";
import type { Container } from "../../src/di/container";
import type { HandlerRegistry } from "../../src/handlers/registry";
import type { ServerlessAdapter } from "../../src/adapters/interfaces";
import type { CelerityLayer } from "@celerity-sdk/types";

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    closeAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Container;
}

function makeRegistry(): HandlerRegistry {
  return { getAllHandlers: vi.fn(() => []) } as unknown as HandlerRegistry;
}

function makeAdapter(): ServerlessAdapter {
  return {
    createHttpHandler: vi.fn(() => vi.fn()),
    createWebSocketHandler: vi.fn(() => vi.fn()),
    createConsumerHandler: vi.fn(() => vi.fn()),
    createScheduleHandler: vi.fn(() => vi.fn()),
    createCustomHandler: vi.fn(() => vi.fn()),
  };
}

describe("ServerlessApplication.createHandler", () => {
  it("delegates to adapter.createHttpHandler for type 'http'", () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    app.createHandler("http");

    expect(adapter.createHttpHandler).toHaveBeenCalledTimes(1);
    expect(adapter.createHttpHandler).toHaveBeenCalledWith(expect.anything(), expect.any(Object));
  });

  it("delegates to adapter.createWebSocketHandler for type 'websocket'", () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    app.createHandler("websocket");

    expect(adapter.createWebSocketHandler).toHaveBeenCalledTimes(1);
  });

  it("delegates to adapter.createConsumerHandler for type 'consumer'", () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    app.createHandler("consumer");

    expect(adapter.createConsumerHandler).toHaveBeenCalledTimes(1);
  });

  it("delegates to adapter.createScheduleHandler for type 'schedule'", () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    app.createHandler("schedule");

    expect(adapter.createScheduleHandler).toHaveBeenCalledTimes(1);
  });

  it("delegates to adapter.createCustomHandler for type 'custom'", () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    app.createHandler("custom");

    expect(adapter.createCustomHandler).toHaveBeenCalledTimes(1);
  });

  it("passes container, systemLayers, and appLayers as PipelineOptions", () => {
    const adapter = makeAdapter();
    const container = makeContainer();
    const systemLayer: CelerityLayer = { handle: vi.fn() };
    const appLayer: CelerityLayer = { handle: vi.fn() };
    const app = new ServerlessApplication(
      makeRegistry(),
      container,
      adapter,
      [systemLayer],
      [appLayer],
    );

    app.createHandler("http");

    expect(adapter.createHttpHandler).toHaveBeenCalledWith(expect.anything(), {
      container,
      systemLayers: [systemLayer],
      appLayers: [appLayer],
    });
  });
});

describe("ServerlessApplication.start", () => {
  it("defaults to HTTP handler type", async () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    await app.start();

    expect(adapter.createHttpHandler).toHaveBeenCalledTimes(1);
  });

  it("creates a WebSocket handler when type is 'websocket'", async () => {
    const adapter = makeAdapter();
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    await app.start("websocket");

    expect(adapter.createWebSocketHandler).toHaveBeenCalledTimes(1);
  });

  it("returns the created handler", async () => {
    const mockHandler = vi.fn();
    const adapter = makeAdapter();
    (adapter.createHttpHandler as ReturnType<typeof vi.fn>).mockReturnValue(mockHandler);
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    const result = await app.start();

    expect(result).toBe(mockHandler);
  });

  it("makes getHandler() return the started handler", async () => {
    const mockHandler = vi.fn();
    const adapter = makeAdapter();
    (adapter.createHttpHandler as ReturnType<typeof vi.fn>).mockReturnValue(mockHandler);
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), adapter);

    await app.start();

    expect(app.getHandler()).toBe(mockHandler);
  });
});

describe("ServerlessApplication.getHandler", () => {
  it("throws if start() has not been called", () => {
    const app = new ServerlessApplication(makeRegistry(), makeContainer(), makeAdapter());

    expect(() => app.getHandler()).toThrow("ServerlessApplication.start() must be called");
  });
});

describe("ServerlessApplication.close", () => {
  it("calls container.closeAll()", async () => {
    const container = makeContainer();
    const app = new ServerlessApplication(makeRegistry(), container, makeAdapter());

    await app.close();

    expect(container.closeAll).toHaveBeenCalledTimes(1);
  });

  it("disposes layers in reverse order after container close", async () => {
    const order: string[] = [];
    const container = makeContainer({
      closeAll: vi.fn(async () => {
        order.push("container");
      }),
    } as Partial<Container>);

    const layerA: CelerityLayer = {
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        order.push("layerA");
      }),
    };

    const layerB: CelerityLayer = {
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        order.push("layerB");
      }),
    };

    const app = new ServerlessApplication(
      makeRegistry(),
      container,
      makeAdapter(),
      [layerA], // system layers
      [layerB], // app layers
    );

    await app.close();

    expect(order).toEqual(["container", "layerB", "layerA"]);
  });

  it("continues disposing remaining layers when one throws", async () => {
    const container = makeContainer();
    const disposed: string[] = [];

    const failingLayer: CelerityLayer = {
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        throw new Error("dispose failed");
      }),
    };

    const goodLayer: CelerityLayer = {
      handle: vi.fn(),
      dispose: vi.fn(async () => {
        disposed.push("good");
      }),
    };

    const app = new ServerlessApplication(
      makeRegistry(),
      container,
      makeAdapter(),
      [goodLayer, failingLayer], // system layers — reversed: failingLayer first, then goodLayer
    );

    // Should NOT throw
    await expect(app.close()).resolves.toBeUndefined();
    expect(disposed).toEqual(["good"]);
  });

  it("skips Type<CelerityLayer> entries (class refs, not instances)", async () => {
    const container = makeContainer();

    class SomeLayer {
      handle = vi.fn();
    }

    // Type<CelerityLayer> is a class constructor, not an instance with dispose
    const app = new ServerlessApplication(
      makeRegistry(),
      container,
      makeAdapter(),
      [SomeLayer as unknown as CelerityLayer],
    );

    // Should not throw trying to call dispose on a class constructor
    await expect(app.close()).resolves.toBeUndefined();
  });
});
