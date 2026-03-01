import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TestingApplication,
  mockRequest,
  mockWebSocketMessage,
  mockConsumerEvent,
  mockScheduleEvent,
} from "../../src/testing/test-app";
import { HandlerRegistry } from "../../src/handlers/registry";
import { Container } from "../../src/di/container";
import { NotFoundException } from "../../src/errors/http-exception";
import type {
  ResolvedHttpHandler,
  ResolvedWebSocketHandler,
  ResolvedConsumerHandler,
  ResolvedScheduleHandler,
  ResolvedCustomHandler,
} from "../../src/handlers/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHttpHandler(overrides?: Partial<ResolvedHttpHandler>): ResolvedHttpHandler {
  return {
    type: "http",
    handlerFn: vi.fn(async () => ({ status: 200, body: "ok", headers: {} })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    protectedBy: [],
    isPublic: false,
    path: "/test",
    method: "GET",
    ...overrides,
  };
}

function makeWebSocketHandler(
  overrides?: Partial<ResolvedWebSocketHandler>,
): ResolvedWebSocketHandler {
  return {
    type: "websocket",
    handlerFn: vi.fn(async () => undefined),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    protectedBy: [],
    isPublic: false,
    route: "message",
    ...overrides,
  };
}

function makeConsumerHandler(
  overrides?: Partial<ResolvedConsumerHandler>,
): ResolvedConsumerHandler {
  return {
    type: "consumer",
    handlerFn: vi.fn(async () => ({ success: true })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    handlerTag: "source::queue::orders",
    ...overrides,
  };
}

function makeScheduleHandler(
  overrides?: Partial<ResolvedScheduleHandler>,
): ResolvedScheduleHandler {
  return {
    type: "schedule",
    handlerFn: vi.fn(async () => ({ success: true })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    handlerTag: "source::schedule::cleanup",
    ...overrides,
  };
}

function makeCustomHandler(overrides?: Partial<ResolvedCustomHandler>): ResolvedCustomHandler {
  return {
    type: "custom",
    handlerFn: vi.fn(async () => ({ result: "done" })),
    layers: [],
    paramMetadata: [],
    customMetadata: {},
    name: "processPayment",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TestingApplication inject methods
// ---------------------------------------------------------------------------

describe("TestingApplication", () => {
  let registry: HandlerRegistry;
  let container: Container;
  let app: TestingApplication;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
    app = new TestingApplication(registry, container);
  });

  // -- injectHttp -----------------------------------------------------------

  describe("injectHttp", () => {
    it("executes HTTP pipeline for matched handler", async () => {
      const handler = makeHttpHandler({
        handlerFn: vi.fn(async () => ({ message: "hello" })),
        handlerInstance: {},
        paramMetadata: [],
      });
      registry.register(handler);

      const request = mockRequest("GET", "/test");
      const response = await app.injectHttp(request);

      expect(response.status).toBe(200);
    });

    it("throws NotFoundException when no handler found", async () => {
      const request = mockRequest("GET", "/unknown");

      await expect(app.injectHttp(request)).rejects.toThrow(NotFoundException);
      await expect(app.injectHttp(request)).rejects.toThrow(
        "No handler found for GET /unknown",
      );
    });
  });

  // -- injectWebSocket ------------------------------------------------------

  describe("injectWebSocket", () => {
    it("executes WebSocket pipeline for matched handler", async () => {
      const handlerFn = vi.fn(async () => undefined);
      const handler = makeWebSocketHandler({
        handlerFn,
        isFunctionHandler: true,
        route: "chat",
      });
      registry.register(handler);

      const message = mockWebSocketMessage({ jsonBody: { text: "hello" } });
      await app.injectWebSocket("chat", message);

      expect(handlerFn).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException when no handler found for route", async () => {
      const message = mockWebSocketMessage();

      await expect(app.injectWebSocket("unknown", message)).rejects.toThrow(NotFoundException);
      await expect(app.injectWebSocket("unknown", message)).rejects.toThrow(
        "No WebSocket handler found for route: unknown",
      );
    });
  });

  // -- injectConsumer -------------------------------------------------------

  describe("injectConsumer", () => {
    it("returns EventResult from consumer pipeline", async () => {
      const handler = makeConsumerHandler({
        handlerFn: vi.fn(async () => ({ success: true })),
        isFunctionHandler: true,
      });
      registry.register(handler);

      const event = mockConsumerEvent("source::queue::orders", [
        { body: '{"orderId":"abc"}' },
      ]);
      const result = await app.injectConsumer("source::queue::orders", event);

      expect(result.success).toBe(true);
    });

    it("throws NotFoundException when no handler found for tag", async () => {
      const event = mockConsumerEvent("unknown-tag", [{ body: "{}" }]);

      await expect(app.injectConsumer("unknown-tag", event)).rejects.toThrow(NotFoundException);
      await expect(app.injectConsumer("unknown-tag", event)).rejects.toThrow(
        "No consumer handler found for tag: unknown-tag",
      );
    });
  });

  // -- injectSchedule -------------------------------------------------------

  describe("injectSchedule", () => {
    it("returns EventResult from schedule pipeline", async () => {
      const handler = makeScheduleHandler({
        handlerFn: vi.fn(async () => ({ success: true })),
        isFunctionHandler: true,
      });
      registry.register(handler);

      const event = mockScheduleEvent("source::schedule::cleanup");
      const result = await app.injectSchedule("source::schedule::cleanup", event);

      expect(result.success).toBe(true);
    });

    it("throws NotFoundException when no handler found for tag", async () => {
      const event = mockScheduleEvent("unknown-tag");

      await expect(app.injectSchedule("unknown-tag", event)).rejects.toThrow(NotFoundException);
      await expect(app.injectSchedule("unknown-tag", event)).rejects.toThrow(
        "No schedule handler found for tag: unknown-tag",
      );
    });
  });

  // -- injectCustom ---------------------------------------------------------

  describe("injectCustom", () => {
    it("returns raw result from custom pipeline", async () => {
      const handler = makeCustomHandler({
        handlerFn: vi.fn(async () => ({ result: "done" })),
        isFunctionHandler: true,
      });
      registry.register(handler);

      const result = await app.injectCustom("processPayment", { amount: 100 });

      expect(result).toEqual({ result: "done" });
    });

    it("defaults payload to null when not provided", async () => {
      const handlerFn = vi.fn(async () => "ok");
      const handler = makeCustomHandler({
        handlerFn,
        isFunctionHandler: true,
      });
      registry.register(handler);

      await app.injectCustom("processPayment");

      expect(handlerFn.mock.calls[0][0]).toBeNull();
    });

    it("throws NotFoundException when no handler found for name", async () => {
      await expect(app.injectCustom("unknown")).rejects.toThrow(NotFoundException);
      await expect(app.injectCustom("unknown")).rejects.toThrow(
        "No custom handler found for name: unknown",
      );
    });
  });

  // -- getContainer / getRegistry -------------------------------------------

  describe("accessors", () => {
    it("returns the container", () => {
      expect(app.getContainer()).toBe(container);
    });

    it("returns the registry", () => {
      expect(app.getRegistry()).toBe(registry);
    });
  });
});

// ---------------------------------------------------------------------------
// Mock factory functions
// ---------------------------------------------------------------------------

describe("mockRequest", () => {
  it("creates a valid HttpRequest with defaults", () => {
    const request = mockRequest("GET", "/test");

    expect(request.method).toBe("GET");
    expect(request.path).toBe("/test");
    expect(request.pathParams).toEqual({});
    expect(request.query).toEqual({});
    expect(request.headers).toEqual({});
    expect(request.cookies).toEqual({});
    expect(request.textBody).toBeNull();
    expect(request.binaryBody).toBeNull();
    expect(request.contentType).toBeNull();
    expect(request.requestId).toBe("test-request-id");
    expect(request.auth).toBeNull();
    expect(request.clientIp).toBe("127.0.0.1");
    expect(request.userAgent).toBe("celerity-testing");
  });

  it("serializes body as JSON and sets content-type", () => {
    const request = mockRequest("POST", "/data", { body: { key: "value" } });

    expect(request.textBody).toBe('{"key":"value"}');
    expect(request.contentType).toBe("application/json");
  });
});

describe("mockWebSocketMessage", () => {
  it("returns valid defaults", () => {
    const message = mockWebSocketMessage();

    expect(message.messageType).toBe("json");
    expect(message.eventType).toBe("message");
    expect(message.connectionId).toBe("test-conn-id");
    expect(message.messageId).toBe("test-msg-id");
    expect(message.jsonBody).toBeNull();
    expect(message.traceContext).toBeNull();
  });

  it("respects overrides", () => {
    const message = mockWebSocketMessage({
      messageType: "binary",
      eventType: "connect",
      connectionId: "conn-123",
      messageId: "msg-456",
      jsonBody: { foo: "bar" },
      traceContext: { traceparent: "00-abc-def-01" },
    });

    expect(message.messageType).toBe("binary");
    expect(message.eventType).toBe("connect");
    expect(message.connectionId).toBe("conn-123");
    expect(message.messageId).toBe("msg-456");
    expect(message.jsonBody).toEqual({ foo: "bar" });
    expect(message.traceContext).toEqual({ traceparent: "00-abc-def-01" });
  });
});

describe("mockConsumerEvent", () => {
  it("builds messages with defaults", () => {
    const event = mockConsumerEvent("source::queue::orders", [
      { body: '{"orderId":"abc"}' },
      { body: '{"orderId":"def"}' },
    ]);

    expect(event.handlerTag).toBe("source::queue::orders");
    expect(event.messages).toHaveLength(2);
    expect(event.messages[0].messageId).toBe("msg-0");
    expect(event.messages[0].body).toBe('{"orderId":"abc"}');
    expect(event.messages[0].source).toBe("test");
    expect(event.messages[0].messageAttributes).toEqual({});
    expect(event.messages[1].messageId).toBe("msg-1");
    expect(event.vendor).toEqual({});
    expect(event.traceContext).toBeNull();
  });

  it("respects message and event overrides", () => {
    const event = mockConsumerEvent(
      "tag",
      [
        { messageId: "custom-id", body: "data", source: "my-queue", messageAttributes: { k: 1 } },
      ],
      { vendor: { platform: "aws" }, traceContext: { traceparent: "tp" } },
    );

    expect(event.messages[0].messageId).toBe("custom-id");
    expect(event.messages[0].source).toBe("my-queue");
    expect(event.messages[0].messageAttributes).toEqual({ k: 1 });
    expect(event.vendor).toEqual({ platform: "aws" });
    expect(event.traceContext).toEqual({ traceparent: "tp" });
  });
});

describe("mockScheduleEvent", () => {
  it("returns valid defaults with handlerTag as default scheduleId", () => {
    const event = mockScheduleEvent("source::schedule::cleanup");

    expect(event.handlerTag).toBe("source::schedule::cleanup");
    expect(event.scheduleId).toBe("source::schedule::cleanup");
    expect(event.messageId).toBe("test-schedule-msg-id");
    expect(event.schedule).toBe("rate(1 day)");
    expect(event.input).toBeUndefined();
    expect(event.vendor).toEqual({});
    expect(event.traceContext).toBeNull();
  });

  it("respects overrides", () => {
    const event = mockScheduleEvent("tag", {
      scheduleId: "custom-id",
      messageId: "msg-1",
      schedule: "cron(0 12 * * ? *)",
      input: { key: "value" },
      vendor: { provider: "aws" },
      traceContext: { traceparent: "tp" },
    });

    expect(event.scheduleId).toBe("custom-id");
    expect(event.messageId).toBe("msg-1");
    expect(event.schedule).toBe("cron(0 12 * * ? *)");
    expect(event.input).toEqual({ key: "value" });
    expect(event.vendor).toEqual({ provider: "aws" });
    expect(event.traceContext).toEqual({ traceparent: "tp" });
  });
});
