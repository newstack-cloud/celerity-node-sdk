import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeConsumerPipeline } from "../../src/handlers/consumer-pipeline";
import { validate } from "../../src/layers/validate";
import type { ResolvedHandlerBase } from "../../src/handlers/types";
import type {
  ConsumerEventInput,
  EventResult,
  BaseHandlerContext,
  CelerityLayer,
  ServiceContainer,
} from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEvent(overrides?: Partial<ConsumerEventInput>): ConsumerEventInput {
  return {
    handlerTag: "test-tag",
    messages: [
      {
        messageId: "msg-1",
        body: '{"order":"abc"}',
        source: "queue-1",
        messageAttributes: {},
        vendor: {},
      },
      {
        messageId: "msg-2",
        body: '{"order":"def"}',
        source: "queue-1",
        messageAttributes: {},
        vendor: {},
      },
    ],
    vendor: { platform: "aws" },
    traceContext: null,
    ...overrides,
  };
}

function createMockContainer(): ServiceContainer {
  const store = new Map<unknown, unknown>();
  return {
    resolve: vi.fn(async (token: unknown) => store.get(token)),
    register: vi.fn((token: unknown, provider: { useValue: unknown }) => {
      store.set(token, provider.useValue);
    }),
    has: vi.fn((token: unknown) => store.has(token)),
  } as unknown as ServiceContainer;
}

function createHandler(overrides?: Partial<ResolvedHandlerBase>): ResolvedHandlerBase {
  return {
    handlerFn: vi.fn().mockResolvedValue({ success: true }),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeConsumerPipeline", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createMockContainer();
  });

  it("invokes a class handler with extracted param arguments", async () => {
    const handlerFn = vi.fn().mockResolvedValue({ success: true });
    const handler = createHandler({
      handlerFn,
      handlerInstance: {},
      paramMetadata: [
        { index: 0, type: "messages" },
        { index: 1, type: "consumerEvent" },
      ],
    });

    const event = createEvent();
    const result = await executeConsumerPipeline(handler, event, { container });

    expect(handlerFn).toHaveBeenCalledOnce();
    // Without schema, @Messages returns raw messages
    expect(handlerFn.mock.calls[0][0]).toEqual(event.messages);
    expect(handlerFn.mock.calls[0][1]).toBe(event);
    expect(result.success).toBe(true);
  });

  it("invokes a function handler with (event, ctx) signature when no schema", async () => {
    const handlerFn = vi.fn().mockResolvedValue({ success: true });
    const handler = createHandler({ handlerFn, isFunctionHandler: true });

    const event = createEvent();
    const result = await executeConsumerPipeline(handler, event, { container });

    expect(handlerFn).toHaveBeenCalledOnce();
    // Without schema, first arg is the full event
    expect(handlerFn.mock.calls[0][0]).toBe(event);
    expect(handlerFn.mock.calls[0][1]).toHaveProperty("event", event);
    expect(handlerFn.mock.calls[0][1]).toHaveProperty("container", container);
    expect(result.success).toBe(true);
  });

  it("resolves injected dependencies for function handlers", async () => {
    const TOKEN = Symbol("SomeService");
    const mockService = { doStuff: vi.fn() };
    (container.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockService);

    const handlerFn = vi.fn().mockResolvedValue({ success: true });
    const handler = createHandler({
      handlerFn,
      isFunctionHandler: true,
      injectTokens: [TOKEN],
    });

    await executeConsumerPipeline(handler, createEvent(), { container });

    expect(container.resolve).toHaveBeenCalledWith(TOKEN);
    expect(handlerFn.mock.calls[0][2]).toBe(mockService);
  });

  it("runs layers in order before invoking the handler", async () => {
    const order: string[] = [];

    const layer1: CelerityLayer<BaseHandlerContext> = {
      handle: async (_ctx, next) => {
        order.push("layer1-before");
        const result = await next();
        order.push("layer1-after");
        return result;
      },
    };

    const layer2: CelerityLayer<BaseHandlerContext> = {
      handle: async (_ctx, next) => {
        order.push("layer2-before");
        const result = await next();
        order.push("layer2-after");
        return result;
      },
    };

    const handlerFn = vi.fn(() => {
      order.push("handler");
      return { success: true };
    });

    const handler = createHandler({ handlerFn, layers: [layer1, layer2] });
    await executeConsumerPipeline(handler, createEvent(), { container });

    expect(order).toEqual([
      "layer1-before",
      "layer2-before",
      "handler",
      "layer2-after",
      "layer1-after",
    ]);
  });

  it("returns { success: false, errorMessage } on uncaught error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handlerFn = vi.fn(() => {
      throw new Error("boom");
    });

    const handler = createHandler({ handlerFn });
    const result = await executeConsumerPipeline(handler, createEvent(), { container });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("boom");
    consoleSpy.mockRestore();
  });

  it("uses context.logger for error logging when available", async () => {
    const mockLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const logLayer: CelerityLayer<BaseHandlerContext> = {
      handle: async (ctx, next) => {
        ctx.logger = mockLogger as never;
        return next();
      },
    };

    const handlerFn = vi.fn(() => {
      throw new Error("boom");
    });

    const handler = createHandler({ handlerFn, layers: [logLayer] });
    await executeConsumerPipeline(handler, createEvent(), { container });

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Unhandled error in consumer handler pipeline",
      expect.objectContaining({ error: "boom", handlerTag: "test-tag" }),
    );
  });

  describe("schema validation (class handler with @Messages(schema))", () => {
    it("validates messages and passes ValidatedConsumerMessage[] to handler", async () => {
      const schema = { parse: vi.fn((data: unknown) => data) };
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "messages" }],
        layers: [validate({ consumerMessage: schema })],
      });

      const event = createEvent();
      const result = await executeConsumerPipeline(handler, event, { container });

      expect(schema.parse).toHaveBeenCalledTimes(2);
      expect(schema.parse).toHaveBeenCalledWith({ order: "abc" });
      expect(schema.parse).toHaveBeenCalledWith({ order: "def" });

      const messages = handlerFn.mock.calls[0][0] as unknown[];
      expect(messages).toHaveLength(2);
      expect(messages[0]).toHaveProperty("parsedBody", { order: "abc" });
      expect(messages[0]).toHaveProperty("messageId", "msg-1");
      expect(messages[1]).toHaveProperty("parsedBody", { order: "def" });
      expect(result.success).toBe(true);
    });

    it("excludes messages that fail JSON parse and reports them as failures", async () => {
      const schema = { parse: vi.fn((data: unknown) => data) };
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "messages" }],
        layers: [validate({ consumerMessage: schema })],
      });

      const event = createEvent({
        messages: [
          { messageId: "msg-1", body: "not-json", source: "q", messageAttributes: {}, vendor: {} },
          {
            messageId: "msg-2",
            body: '{"valid":true}',
            source: "q",
            messageAttributes: {},
            vendor: {},
          },
        ],
      });

      const result = await executeConsumerPipeline(handler, event, { container });

      // msg-1 failed JSON parse — excluded from handler args
      const messages = handlerFn.mock.calls[0][0] as unknown[];
      expect(messages).toHaveLength(1);
      expect(messages[0]).toHaveProperty("messageId", "msg-2");

      // Validation failure reported
      expect(result.failures).toBeDefined();
      const failedIds = result.failures!.map((f) => f.messageId);
      expect(failedIds).toContain("msg-1");
    });

    it("excludes messages that fail schema.parse and reports them as failures", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => {
          const d = data as { valid?: boolean };
          if (!d.valid) throw new Error("validation failed");
          return data;
        }),
      };
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "messages" }],
        layers: [validate({ consumerMessage: schema })],
      });

      const event = createEvent({
        messages: [
          {
            messageId: "msg-1",
            body: '{"valid":false}',
            source: "q",
            messageAttributes: {},
            vendor: {},
          },
          {
            messageId: "msg-2",
            body: '{"valid":true}',
            source: "q",
            messageAttributes: {},
            vendor: {},
          },
        ],
      });

      const result = await executeConsumerPipeline(handler, event, { container });

      const messages = handlerFn.mock.calls[0][0] as unknown[];
      expect(messages).toHaveLength(1);
      expect(messages[0]).toHaveProperty("messageId", "msg-2");

      expect(result.failures).toBeDefined();
      expect(result.failures!.find((f) => f.messageId === "msg-1")?.errorMessage).toBe(
        "validation failed",
      );
    });

    it("merges validation failures with handler-returned failures", async () => {
      const schema = {
        parse: vi.fn((data: unknown) => {
          const d = data as { valid?: boolean };
          if (!d.valid) throw new Error("schema error");
          return data;
        }),
      };
      const handlerFn = vi.fn().mockResolvedValue({
        success: false,
        failures: [{ messageId: "msg-2", errorMessage: "processing error" }],
      });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "messages" }],
        layers: [validate({ consumerMessage: schema })],
      });

      const event = createEvent({
        messages: [
          {
            messageId: "msg-1",
            body: '{"valid":false}',
            source: "q",
            messageAttributes: {},
            vendor: {},
          },
          {
            messageId: "msg-2",
            body: '{"valid":true}',
            source: "q",
            messageAttributes: {},
            vendor: {},
          },
        ],
      });

      const result = await executeConsumerPipeline(handler, event, { container });

      expect(result.failures).toHaveLength(2);
      const failedIds = result.failures!.map((f) => f.messageId);
      expect(failedIds).toContain("msg-1"); // validation failure
      expect(failedIds).toContain("msg-2"); // handler-reported failure
    });
  });

  describe("schema validation (function handler with messageSchema)", () => {
    it("validates messages via validation layer", async () => {
      const schema = { parse: vi.fn((data: unknown) => data) };
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validate({ consumerMessage: schema })],
      });

      const event = createEvent();
      const result = await executeConsumerPipeline(handler, event, { container });

      expect(schema.parse).toHaveBeenCalledTimes(2);
      // With schema, first arg is validated messages (not the event)
      const messages = handlerFn.mock.calls[0][0] as unknown[];
      expect(messages).toHaveLength(2);
      expect(messages[0]).toHaveProperty("parsedBody");
      expect(result.success).toBe(true);
    });
  });

  describe("param extraction", () => {
    it("extracts all consumer param types correctly", async () => {
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [
          { index: 0, type: "messages" },
          { index: 1, type: "consumerEvent" },
          { index: 2, type: "consumerVendor" },
          { index: 3, type: "consumerTraceContext" },
        ],
      });

      const traceContext = { traceparent: "00-abc-def-01" };
      const event = createEvent({ vendor: { platform: "aws" }, traceContext });
      await executeConsumerPipeline(handler, event, { container });

      expect(handlerFn.mock.calls[0][0]).toEqual(event.messages);
      expect(handlerFn.mock.calls[0][1]).toBe(event);
      expect(handlerFn.mock.calls[0][2]).toEqual({ platform: "aws" });
      expect(handlerFn.mock.calls[0][3]).toEqual(traceContext);
    });

    it("returns null for consumerTraceContext when not present", async () => {
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "consumerTraceContext" }],
      });

      const event = createEvent({ traceContext: undefined });
      await executeConsumerPipeline(handler, event, { container });

      expect(handlerFn.mock.calls[0][0]).toBeNull();
    });

    it("returns undefined for unknown param type", async () => {
      const handlerFn = vi.fn().mockResolvedValue({ success: true });
      const handler = createHandler({
        handlerFn,
        handlerInstance: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paramMetadata: [{ index: 0, type: "unknown" as any }],
      });

      await executeConsumerPipeline(handler, createEvent(), { container });

      expect(handlerFn.mock.calls[0][0]).toBeUndefined();
    });
  });

  it("sets handlerName in context metadata", async () => {
    const handlerFn = vi.fn().mockResolvedValue({ success: true });
    const handler = createHandler({ handlerFn, isFunctionHandler: true });

    await executeConsumerPipeline(handler, createEvent(), {
      container,
      handlerName: "orders.process",
    });

    const ctx = handlerFn.mock.calls[0][1];
    expect(ctx.metadata.get("handlerName")).toBe("orders.process");
  });

  it("returns handler result directly when no schema validation failures", async () => {
    const expectedResult: EventResult = {
      success: false,
      failures: [{ messageId: "msg-1", errorMessage: "bad data" }],
      errorMessage: "partial failure",
    };
    const handlerFn = vi.fn().mockResolvedValue(expectedResult);
    const handler = createHandler({ handlerFn, isFunctionHandler: true });

    const result = await executeConsumerPipeline(handler, createEvent(), { container });

    expect(result).toEqual(expectedResult);
  });
});
