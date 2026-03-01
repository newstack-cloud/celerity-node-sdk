import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeCustomPipeline } from "../../src/handlers/custom-pipeline";
import { validate } from "../../src/layers/validate";
import type { CustomPipelineOptions } from "../../src/handlers/custom-pipeline";
import type { ResolvedHandlerBase } from "../../src/handlers/types";
import type { BaseHandlerContext, CelerityLayer } from "@celerity-sdk/types";
import { Container } from "../../src/di/container";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(overrides?: Partial<ResolvedHandlerBase>): ResolvedHandlerBase {
  return {
    handlerFn: vi.fn(async () => ({ result: "ok" })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    ...overrides,
  };
}

function makeOptions(container?: Container): CustomPipelineOptions {
  return { container: container ?? new Container() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeCustomPipeline", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("class handler invocation", () => {
    it("invokes class handler with payload param extraction", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => "done");
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "payload" }],
      });

      const result = await executeCustomPipeline(handler, { key: "value" }, makeOptions(container));

      expect(result).toBe("done");
      expect(handlerFn).toHaveBeenCalledOnce();
      expect(handlerFn.mock.calls[0][0]).toEqual({ key: "value" });
    });

    it("extracts invokeContext param", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => "ok");
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [
          { index: 0, type: "payload" },
          { index: 1, type: "invokeContext" },
        ],
      });

      await executeCustomPipeline(handler, "test", makeOptions(container));

      expect(handlerFn.mock.calls[0][1]).toHaveProperty("metadata");
      expect(handlerFn.mock.calls[0][1]).toHaveProperty("container");
    });

    it("returns undefined for unknown param types", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => "ok");
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [
          { index: 0, type: "payload" },
          { index: 1, type: "scheduleId" as never },
        ],
      });

      await executeCustomPipeline(handler, "test", makeOptions(container));

      expect(handlerFn.mock.calls[0][1]).toBeUndefined();
    });
  });

  describe("function handler invocation", () => {
    it("invokes function handler with (payload, ctx, ...deps)", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ status: "processed" }));
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
      });

      const result = await executeCustomPipeline(handler, "my-payload", makeOptions(container));

      expect(result).toEqual({ status: "processed" });
      expect(handlerFn).toHaveBeenCalledOnce();
      expect(handlerFn.mock.calls[0][0]).toBe("my-payload");
    });

    it("resolves DI dependencies for function handlers", async () => {
      const TOKEN = Symbol("SVC");
      const svc = { run: vi.fn() };
      container.register(TOKEN, { useValue: svc });

      const handlerFn = vi.fn(async (..._args: unknown[]) => "done");
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        injectTokens: [TOKEN],
      });

      await executeCustomPipeline(handler, null, makeOptions(container));

      expect(handlerFn.mock.calls[0][2]).toBe(svc);
    });
  });

  describe("schema validation", () => {
    it("validates payload via validation layer", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => {
          const d = data as { key: string };
          return { key: d.key.toUpperCase() };
        }),
      };

      const handlerFn = vi.fn(async (..._args: unknown[]) => "ok");
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "payload" }],
        layers: [validate({ customPayload: schema })],
      });

      const result = await executeCustomPipeline(
        handler,
        { key: "value" },
        makeOptions(container),
      );

      expect(result).toBe("ok");
      expect(schema.parse).toHaveBeenCalledWith({ key: "value" });
      expect(handlerFn.mock.calls[0][0]).toEqual({ key: "VALUE" });
    });

    it("validates payload for function handlers via validation layer", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => data),
      };

      const handlerFn = vi.fn(async (..._args: unknown[]) => "ok");
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validate({ customPayload: schema })],
      });

      await executeCustomPipeline(handler, "test-payload", makeOptions(container));

      expect(schema.parse).toHaveBeenCalledWith("test-payload");
    });

    it("re-throws schema validation errors (not wrapped in EventResult)", async () => {
      const schema = {
        parse: () => {
          throw new Error("Validation failed: invalid payload");
        },
      };

      const handlerFn = vi.fn(async (..._args: unknown[]) => "ok");
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "payload" }],
        layers: [validate({ customPayload: schema })],
      });

      await expect(
        executeCustomPipeline(handler, "bad", makeOptions(container)),
      ).rejects.toThrow("Validation failed: invalid payload");

      expect(handlerFn).not.toHaveBeenCalled();
    });
  });

  describe("layers", () => {
    it("executes layers in order around handler", async () => {
      const order: string[] = [];

      const layer: CelerityLayer<BaseHandlerContext> = {
        async handle(_ctx, next) {
          order.push("layer-before");
          const result = await next();
          order.push("layer-after");
          return result;
        },
      };

      const handlerFn = vi.fn(async (..._args: unknown[]) => {
        order.push("handler");
        return "done";
      });

      const handler = makeHandler({ handlerFn, layers: [layer] });
      await executeCustomPipeline(handler, null, makeOptions(container));

      expect(order).toEqual(["layer-before", "handler", "layer-after"]);
    });
  });

  describe("error handling", () => {
    it("re-throws Error from handler (not wrapped)", async () => {
      const handler = makeHandler({
        handlerFn: vi.fn(async () => {
          throw new Error("boom");
        }),
      });

      await expect(
        executeCustomPipeline(handler, null, makeOptions(container)),
      ).rejects.toThrow("boom");
    });

    it("re-throws non-Error from handler", async () => {
      const handler = makeHandler({
        handlerFn: vi.fn(async () => {
          throw "string error";
        }),
      });

      await expect(
        executeCustomPipeline(handler, null, makeOptions(container)),
      ).rejects.toBe("string error");
    });

    it("returns raw result (no EventResult wrapping)", async () => {
      const handler = makeHandler({
        handlerFn: vi.fn(async () => ({
          data: [1, 2, 3],
          total: 3,
        })),
      });

      const result = await executeCustomPipeline(handler, null, makeOptions(container));

      expect(result).toEqual({ data: [1, 2, 3], total: 3 });
    });

    it("returns undefined when handler returns nothing", async () => {
      const handler = makeHandler({
        handlerFn: vi.fn(async () => undefined),
      });

      const result = await executeCustomPipeline(handler, null, makeOptions(container));

      expect(result).toBeUndefined();
    });
  });

  describe("handlerName", () => {
    it("sets handlerName in metadata store", async () => {
      let capturedName: unknown;
      const handlerFn = vi.fn(async (_payload: unknown, ctx: unknown) => {
        const c = ctx as { metadata: { get(k: string): unknown } };
        capturedName = c.metadata.get("handlerName");
        return "ok";
      });

      const handler = makeHandler({ handlerFn, isFunctionHandler: true });

      await executeCustomPipeline(handler, null, {
        ...makeOptions(container),
        handlerName: "processPayment",
      });

      expect(capturedName).toBe("processPayment");
    });
  });
});
