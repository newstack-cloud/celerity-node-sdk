import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeSchedulePipeline } from "../../src/handlers/schedule-pipeline";
import { validate } from "../../src/layers/validate";
import type { SchedulePipelineOptions } from "../../src/handlers/schedule-pipeline";
import type { ResolvedHandlerBase } from "../../src/handlers/types";
import type {
  ScheduleEventInput,
  EventResult,
  BaseHandlerContext,
  CelerityLayer,
} from "@celerity-sdk/types";
import { Container } from "../../src/di/container";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides?: Partial<ScheduleEventInput>): ScheduleEventInput {
  return {
    handlerTag: "source::maint::daily",
    scheduleId: "daily-cleanup",
    messageId: "msg-1",
    schedule: "rate(1 day)",
    input: undefined,
    vendor: {},
    traceContext: null,
    ...overrides,
  };
}

function makeHandler(overrides?: Partial<ResolvedHandlerBase>): ResolvedHandlerBase {
  return {
    handlerFn: vi.fn(async () => ({ success: true })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    ...overrides,
  };
}

function makeOptions(container?: Container): SchedulePipelineOptions {
  return { container: container ?? new Container() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeSchedulePipeline", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("class handler invocation", () => {
    it("invokes class handler with param extraction", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [
          { index: 0, type: "scheduleInput" },
          { index: 1, type: "scheduleId" },
        ],
      });

      const event = makeEvent({ input: { key: "value" } });
      const result = await executeSchedulePipeline(handler, event, makeOptions(container));

      expect(result).toEqual({ success: true });
      expect(handlerFn).toHaveBeenCalledOnce();
      const args = handlerFn.mock.calls[0];
      expect(args[0]).toEqual({ key: "value" });
      expect(args[1]).toBe("daily-cleanup");
    });

    it("extracts scheduleExpression param", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "scheduleExpression" }],
      });

      const result = await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(result.success).toBe(true);
      expect(handlerFn.mock.calls[0][0]).toBe("rate(1 day)");
    });

    it("extracts scheduleEvent param (full event)", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "scheduleEvent" }],
      });

      const event = makeEvent();
      await executeSchedulePipeline(handler, event, makeOptions(container));

      expect(handlerFn.mock.calls[0][0]).toEqual(event);
    });
  });

  describe("function handler invocation", () => {
    it("invokes function handler with (event, ctx, ...deps)", async () => {
      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
      });

      const event = makeEvent();
      const result = await executeSchedulePipeline(handler, event, makeOptions(container));

      expect(result).toEqual({ success: true });
      expect(handlerFn).toHaveBeenCalledOnce();
      expect(handlerFn.mock.calls[0][0]).toEqual(event);
    });

    it("resolves DI dependencies for function handlers", async () => {
      const TOKEN = Symbol("SVC");
      const svc = { run: vi.fn() };
      container.register(TOKEN, { useValue: svc });

      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        injectTokens: [TOKEN],
      });

      await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(handlerFn.mock.calls[0][2]).toBe(svc);
    });
  });

  describe("schema validation", () => {
    it("validates event.input via validation layer", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => {
          const d = data as { key: string };
          return { key: d.key.toUpperCase() };
        }),
      };

      const handlerFn = vi.fn(async (..._args: unknown[]) => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "scheduleInput" }],
        layers: [validate({ scheduleInput: schema })],
      });

      const event = makeEvent({ input: { key: "value" } });
      const result = await executeSchedulePipeline(handler, event, makeOptions(container));

      expect(result.success).toBe(true);
      expect(schema.parse).toHaveBeenCalledWith({ key: "value" });
      expect(handlerFn.mock.calls[0][0]).toEqual({ key: "VALUE" });
    });

    it("validates event.input for function handlers via validation layer", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => data),
      };

      const handlerFn = vi.fn(async () => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validate({ scheduleInput: schema })],
      });

      const event = makeEvent({ input: "test-input" });
      await executeSchedulePipeline(handler, event, makeOptions(container));

      expect(schema.parse).toHaveBeenCalledWith("test-input");
    });

    it("returns error EventResult when schema validation fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const schema = {
        parse: () => {
          throw new Error("Validation failed: invalid input");
        },
      };

      const handlerFn = vi.fn(async () => ({ success: true }));
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "scheduleInput" }],
        layers: [validate({ scheduleInput: schema })],
      });

      const result = await executeSchedulePipeline(
        handler,
        makeEvent({ input: "bad" }),
        makeOptions(container),
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Validation failed: invalid input");
      expect(handlerFn).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
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

      const handlerFn = vi.fn(async () => {
        order.push("handler");
        return { success: true };
      });

      const handler = makeHandler({ handlerFn, handlerInstance: {}, layers: [layer] });
      await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(order).toEqual(["layer-before", "handler", "layer-after"]);
    });
  });

  describe("error handling", () => {
    it("wraps uncaught errors in EventResult", async () => {
      const handler = makeHandler({
        handlerInstance: {},
        handlerFn: vi.fn(async () => {
          throw new Error("boom");
        }),
      });

      const result = await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("boom");
    });

    it("wraps non-Error throws in EventResult", async () => {
      const handler = makeHandler({
        handlerInstance: {},
        handlerFn: vi.fn(async () => {
          throw "string error";
        }),
      });

      const result = await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("string error");
    });

    it("passes through handler's EventResult", async () => {
      const handlerResult: EventResult = {
        success: false,
        errorMessage: "task failed",
      };

      const handler = makeHandler({
        handlerInstance: {},
        handlerFn: vi.fn(async () => handlerResult),
      });

      const result = await executeSchedulePipeline(handler, makeEvent(), makeOptions(container));

      expect(result).toEqual(handlerResult);
    });
  });

  describe("handlerName", () => {
    it("sets handlerName in metadata store", async () => {
      let capturedName: unknown;
      const handlerFn = vi.fn(async (_event: unknown, ctx: unknown) => {
        const c = ctx as { metadata: { get(k: string): unknown } };
        capturedName = c.metadata.get("handlerName");
        return { success: true };
      });

      const handler = makeHandler({ handlerFn, isFunctionHandler: true });

      await executeSchedulePipeline(handler, makeEvent(), {
        ...makeOptions(container),
        handlerName: "daily-cleanup",
      });

      expect(capturedName).toBe("daily-cleanup");
    });
  });
});
