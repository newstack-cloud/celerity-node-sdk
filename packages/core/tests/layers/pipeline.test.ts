import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { runLayerPipeline } from "../../src/layers/pipeline";
import { HandlerMetadataStore } from "../../src/metadata/handler-metadata";
import type { HandlerContext, HandlerResponse, CelerityLayer } from "@celerity-sdk/types";
import { Container } from "../../src";

function makeContext(overrides: Partial<HandlerContext["request"]> = {}): HandlerContext {
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
      requestId: "req-1",
      requestTime: new Date().toISOString(),
      auth: null,
      clientIp: null,
      traceContext: null,
      userAgent: null,
      matchedRoute: null,
      ...overrides,
    },
    container: new Container(),
    metadata: new HandlerMetadataStore({}),
  };
}

function makeResponse(status = 200): HandlerResponse {
  return { status, headers: { "content-type": "application/json" }, body: "{}" };
}

describe("runLayerPipeline", () => {
  it("calls the handler directly when there are no layers", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn().mockResolvedValue(makeResponse());

    // Act
    const result = await runLayerPipeline([], context, handler);

    // Assert
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual(makeResponse());
  });

  it("passes context and next through a single layer", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn().mockResolvedValue(makeResponse());

    const layer: CelerityLayer = {
      handle: vi.fn(async (ctx, next) => {
        return next();
      }),
    };

    // Act
    const result = await runLayerPipeline([layer], context, handler);

    // Assert
    expect(layer.handle).toHaveBeenCalledWith(context, expect.any(Function));
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual(makeResponse());
  });

  it("executes layers in order (first-in, first-to-run)", async () => {
    // Arrange
    const context = makeContext();
    const executionOrder: string[] = [];
    const handler = vi.fn(async () => {
      executionOrder.push("handler");
      return makeResponse();
    });

    const layerA: CelerityLayer = {
      handle: async (ctx, next) => {
        executionOrder.push("A:before");
        const result = await next();
        executionOrder.push("A:after");
        return result;
      },
    };

    const layerB: CelerityLayer = {
      handle: async (ctx, next) => {
        executionOrder.push("B:before");
        const result = await next();
        executionOrder.push("B:after");
        return result;
      },
    };

    // Act
    await runLayerPipeline([layerA, layerB], context, handler);

    // Assert
    expect(executionOrder).toEqual([
      "A:before",
      "B:before",
      "handler",
      "B:after",
      "A:after",
    ]);
  });

  it("supports short-circuit by not calling next()", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn().mockResolvedValue(makeResponse());
    const shortCircuitResponse = makeResponse(403);

    const blockingLayer: CelerityLayer = {
      handle: async (_ctx, _next) => {
        return shortCircuitResponse;
      },
    };

    const unreachedLayer: CelerityLayer = {
      handle: vi.fn(async (_ctx, next) => next()),
    };

    // Act
    const result = await runLayerPipeline(
      [blockingLayer, unreachedLayer],
      context,
      handler,
    );

    // Assert
    expect(result).toBe(shortCircuitResponse);
    expect(unreachedLayer.handle).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows a layer to modify context before passing to the next layer", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => makeResponse());

    const enrichingLayer: CelerityLayer = {
      handle: async (ctx, next) => {
        ctx.metadata.set("customData", "enriched");
        return next();
      },
    };

    let downstreamSawValue: unknown;
    const inspectingLayer: CelerityLayer = {
      handle: vi.fn(async (ctx, next) => {
        downstreamSawValue = ctx.metadata.get("customData");
        return next();
      }),
    };

    // Act
    await runLayerPipeline([enrichingLayer, inspectingLayer], context, handler);

    // Assert
    expect(context.metadata.get("customData")).toBe("enriched");
    expect(downstreamSawValue).toBe("enriched");
  });

  it("allows a layer to transform the response returned by next()", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => makeResponse(200));

    const transformingLayer: CelerityLayer = {
      handle: async (_ctx, next) => {
        const response = await next();
        return {
          ...response,
          headers: { ...response.headers, "x-custom": "added" },
        };
      },
    };

    // Act
    const result = await runLayerPipeline([transformingLayer], context, handler);

    // Assert
    expect(result.headers).toEqual(
      expect.objectContaining({ "x-custom": "added" }),
    );
  });

  it("resolves class-based layers (Type<CelerityLayer>) by instantiating them", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => makeResponse());
    const handleSpy = vi.fn(async (_ctx: HandlerContext, next: () => Promise<HandlerResponse>) => next());

    class TestLayer implements CelerityLayer {
      handle = handleSpy;
    }

    // Act
    await runLayerPipeline([TestLayer], context, handler);

    // Assert
    expect(handleSpy).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects if next() is called multiple times in the same layer", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => makeResponse());

    const doubleCallLayer: CelerityLayer = {
      handle: async (_ctx, next) => {
        await next();
        return next();
      },
    };

    // Act & Assert
    await expect(
      runLayerPipeline([doubleCallLayer], context, handler),
    ).rejects.toThrow("next() called multiple times");
  });

  it("propagates errors thrown inside a layer", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => makeResponse());

    const errorLayer: CelerityLayer = {
      handle: async () => {
        throw new Error("layer boom");
      },
    };

    // Act & Assert
    await expect(
      runLayerPipeline([errorLayer], context, handler),
    ).rejects.toThrow("layer boom");
    expect(handler).not.toHaveBeenCalled();
  });

  it("propagates errors thrown by the handler through layers", async () => {
    // Arrange
    const context = makeContext();
    const handler = vi.fn(async () => {
      throw new Error("handler boom");
    });

    const catchLayer: CelerityLayer = {
      handle: async (_ctx, next) => {
        try {
          return await next();
        } catch {
          return { status: 500, body: "caught" };
        }
      },
    };

    // Act
    const result = await runLayerPipeline([catchLayer], context, handler);

    // Assert
    expect(result).toEqual({ status: 500, body: "caught" });
  });
});
