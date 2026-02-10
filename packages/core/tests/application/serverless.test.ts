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
  return { createHandler: vi.fn(() => vi.fn()) } as unknown as ServerlessAdapter;
}

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
