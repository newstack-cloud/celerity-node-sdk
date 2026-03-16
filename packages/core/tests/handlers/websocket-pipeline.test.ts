import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWebSocketPipeline } from "../../src/handlers/websocket-pipeline";
import { validate } from "../../src/layers/validate";
import type { ResolvedHandlerBase } from "../../src/handlers/types";
import type {
  WebSocketMessage,
  BaseHandlerContext,
  CelerityLayer,
  ServiceContainer,
} from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMessage(overrides?: Partial<WebSocketMessage>): WebSocketMessage {
  return {
    messageType: "json",
    eventType: "message",
    connectionId: "conn-1",
    messageId: "msg-1",
    jsonBody: { text: "hello" },
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
    handlerFn: vi.fn(),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeWebSocketPipeline", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createMockContainer();
  });

  it("invokes a class handler with extracted param arguments", async () => {
    const handlerFn = vi.fn();
    const handler = createHandler({
      handlerFn,
      handlerInstance: {},
      paramMetadata: [
        { index: 0, type: "connectionId" },
        { index: 1, type: "messageBody" },
      ],
    });

    const message = createMessage({ connectionId: "conn-42", jsonBody: { text: "hi" } });
    await executeWebSocketPipeline(handler, message, { container });

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(handlerFn.mock.calls[0][0]).toBe("conn-42");
    expect(handlerFn.mock.calls[0][1]).toEqual({ text: "hi" });
  });

  it("invokes a function handler with (message, ctx) signature", async () => {
    const handlerFn = vi.fn();
    const handler = createHandler({ handlerFn, isFunctionHandler: true });

    const message = createMessage();
    await executeWebSocketPipeline(handler, message, { container });

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(handlerFn.mock.calls[0][0]).toBe(message);
    expect(handlerFn.mock.calls[0][1]).toHaveProperty("message", message);
    expect(handlerFn.mock.calls[0][1]).toHaveProperty("container", container);
  });

  it("resolves injected dependencies for function handlers", async () => {
    const TOKEN = Symbol("SomeService");
    const mockService = { doStuff: vi.fn() };
    (container.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockService);

    const handlerFn = vi.fn();
    const handler = createHandler({
      handlerFn,
      isFunctionHandler: true,
      injectTokens: [TOKEN],
    });

    await executeWebSocketPipeline(handler, createMessage(), { container });

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
    });

    const handler = createHandler({ handlerFn, handlerInstance: {}, layers: [layer1, layer2] });
    await executeWebSocketPipeline(handler, createMessage(), { container });

    expect(order).toEqual([
      "layer1-before",
      "layer2-before",
      "handler",
      "layer2-after",
      "layer1-after",
    ]);
  });

  it("returns void (no response for WebSocket handlers)", async () => {
    const handler = createHandler({ handlerFn: vi.fn(), handlerInstance: {} });
    const result = await executeWebSocketPipeline(handler, createMessage(), { container });
    expect(result).toBeUndefined();
  });

  it("catches and logs errors without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handlerFn = vi.fn(() => {
      throw new Error("boom");
    });

    const handler = createHandler({ handlerFn, handlerInstance: {} });
    await expect(
      executeWebSocketPipeline(handler, createMessage(), { container }),
    ).resolves.toBeUndefined();

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

    const handler = createHandler({ handlerFn, handlerInstance: {}, layers: [logLayer] });
    await executeWebSocketPipeline(handler, createMessage(), { container });

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Unhandled error in WebSocket handler pipeline",
      expect.objectContaining({ error: "boom", connectionId: "conn-1" }),
    );
  });

  it("extracts all WebSocket param types correctly", async () => {
    const handlerFn = vi.fn();
    const handler = createHandler({
      handlerFn,
      handlerInstance: {},
      paramMetadata: [
        { index: 0, type: "connectionId" },
        { index: 1, type: "messageBody" },
        { index: 2, type: "messageId" },
        { index: 3, type: "eventType" },
        { index: 4, type: "requestContext" },
      ],
    });

    const message = createMessage({
      connectionId: "conn-1",
      messageId: "msg-1",
      eventType: "message",
      jsonBody: { data: true },
      requestContext: {
        requestId: "req-1",
        requestTime: 1000,
        path: "/ws",
        protocolVersion: "13",
        headers: {},
        clientIp: "127.0.0.1",
        query: {},
        cookies: {},
      },
    });
    await executeWebSocketPipeline(handler, message, { container });

    expect(handlerFn.mock.calls[0][0]).toBe("conn-1");
    expect(handlerFn.mock.calls[0][1]).toEqual({ data: true });
    expect(handlerFn.mock.calls[0][2]).toBe("msg-1");
    expect(handlerFn.mock.calls[0][3]).toBe("message");
    expect(handlerFn.mock.calls[0][4]).toEqual(
      expect.objectContaining({ requestId: "req-1", path: "/ws" }),
    );
  });

  it("validates @MessageBody(schema) through validation layer", async () => {
    const schema = { parse: vi.fn((data: unknown) => ({ validated: data })) };
    const handlerFn = vi.fn();
    const handler = createHandler({
      handlerFn,
      handlerInstance: {},
      paramMetadata: [{ index: 0, type: "messageBody" }],
      layers: [validate({ wsMessageBody: schema })],
    });

    const message = createMessage({ jsonBody: { raw: true } });
    await executeWebSocketPipeline(handler, message, { container });

    expect(schema.parse).toHaveBeenCalledWith({ raw: true });
    expect(handlerFn.mock.calls[0][0]).toEqual({ validated: { raw: true } });
  });

  it("returns undefined for @MessageBody when jsonBody is undefined", async () => {
    const handlerFn = vi.fn();
    const handler = createHandler({
      handlerFn,
      handlerInstance: {},
      paramMetadata: [{ index: 0, type: "messageBody" }],
    });

    const message = createMessage({ jsonBody: undefined });
    await executeWebSocketPipeline(handler, message, { container });

    expect(handlerFn.mock.calls[0][0]).toBeUndefined();
  });

  it("sets handlerName in context metadata", async () => {
    const handlerFn = vi.fn();
    const handler = createHandler({ handlerFn, isFunctionHandler: true });

    await executeWebSocketPipeline(handler, createMessage(), {
      container,
      handlerName: "chat.default",
    });

    const ctx = handlerFn.mock.calls[0][1];
    expect(ctx.metadata.get("handlerName")).toBe("chat.default");
  });
});
