import { describe, it, expect } from "vitest";
import {
  mapRuntimeRequest,
  mapToRuntimeResponse,
  mapWebSocketMessage,
  mapConsumerEventInput,
  mapScheduleEventInput,
  mapToNapiEventResult,
  flattenMultiValueRecord,
} from "../../src/bootstrap/runtime-mapper";
import type {
  JsWebSocketMessageInfo,
  JsConsumerEventInput,
  JsScheduleEventInput,
} from "../../src/bootstrap/runtime-mapper";
import { JsWebSocketEventType } from "@celerity-sdk/runtime";

describe("flattenMultiValueRecord", () => {
  it("flattens single-element arrays to plain strings", () => {
    const input = { "content-type": ["application/json"], accept: ["text/html"] };
    expect(flattenMultiValueRecord(input)).toEqual({
      "content-type": "application/json",
      accept: "text/html",
    });
  });

  it("keeps multi-element arrays as arrays", () => {
    const input = { "set-cookie": ["a=1", "b=2"] };
    expect(flattenMultiValueRecord(input)).toEqual({
      "set-cookie": ["a=1", "b=2"],
    });
  });

  it("handles empty records", () => {
    expect(flattenMultiValueRecord({})).toEqual({});
  });

  it("handles mix of single and multi-value entries", () => {
    const input = {
      host: ["example.com"],
      "x-forwarded-for": ["1.1.1.1", "2.2.2.2"],
    };
    expect(flattenMultiValueRecord(input)).toEqual({
      host: "example.com",
      "x-forwarded-for": ["1.1.1.1", "2.2.2.2"],
    });
  });
});

describe("mapRuntimeRequest", () => {
  function makeRuntimeRequest(overrides: Record<string, unknown> = {}) {
    return {
      method: "GET",
      path: "/items/42",
      pathParams: { id: "42" },
      query: { page: ["1"] } as Record<string, string[]>,
      headers: { "content-type": ["application/json"] } as Record<string, string[]>,
      cookies: { session: "abc" },
      textBody: '{"name":"test"}',
      binaryBody: null,
      contentType: "application/json",
      requestId: "req-123",
      requestTime: "2026-01-01T00:00:00Z",
      auth: { sub: "user-1" },
      clientIp: "127.0.0.1",
      traceContext: { traceparent: "00-trace-span-01" } as Record<string, string> | null,
      userAgent: "TestAgent/1.0",
      matchedRoute: "/items/{id}",
      httpVersion: "HTTP/1.1",
      uri: "/items/42?page=1",
      ...overrides,
    };
  }

  it("maps all fields from runtime request to SDK HttpRequest", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest());

    expect(result).toEqual({
      method: "GET",
      path: "/items/42",
      pathParams: { id: "42" },
      query: { page: "1" },
      headers: { "content-type": "application/json" },
      cookies: { session: "abc" },
      textBody: '{"name":"test"}',
      binaryBody: null,
      contentType: "application/json",
      requestId: "req-123",
      requestTime: "2026-01-01T00:00:00Z",
      auth: { sub: "user-1" },
      clientIp: "127.0.0.1",
      traceContext: { traceparent: "00-trace-span-01" },
      userAgent: "TestAgent/1.0",
      matchedRoute: "/items/{id}",
    });
  });

  it("uppercases the HTTP method", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ method: "post" }));
    expect(result.method).toBe("POST");
  });

  it("flattens single-value headers and query params", () => {
    const result = mapRuntimeRequest(
      makeRuntimeRequest({
        headers: { host: ["example.com"], "x-custom": ["a", "b"] },
        query: { tag: ["red", "blue"], limit: ["10"] },
      }),
    );

    expect(result.headers).toEqual({ host: "example.com", "x-custom": ["a", "b"] });
    expect(result.query).toEqual({ tag: ["red", "blue"], limit: "10" });
  });

  it("handles null traceContext", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ traceContext: null }));
    expect(result.traceContext).toBeNull();
  });

  it("passes through traceContext record as-is", () => {
    const result = mapRuntimeRequest(
      makeRuntimeRequest({ traceContext: { xray_trace_id: "1-abc" } }),
    );
    expect(result.traceContext).toEqual({ xray_trace_id: "1-abc" });
  });

  it("converts empty contentType to null", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ contentType: "" }));
    expect(result.contentType).toBeNull();
  });

  it("converts empty clientIp to null", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ clientIp: "" }));
    expect(result.clientIp).toBeNull();
  });

  it("converts empty userAgent to null", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ userAgent: "" }));
    expect(result.userAgent).toBeNull();
  });

  it("handles null auth", () => {
    const result = mapRuntimeRequest(makeRuntimeRequest({ auth: null }));
    expect(result.auth).toBeNull();
  });

  it("passes through binary body", () => {
    const buf = Buffer.from("binary data");
    const result = mapRuntimeRequest(
      makeRuntimeRequest({ textBody: null, binaryBody: buf }),
    );
    expect(result.textBody).toBeNull();
    expect(result.binaryBody).toBe(buf);
  });
});

describe("mapToRuntimeResponse", () => {
  it("maps SDK HttpResponse to runtime Response", () => {
    const result = mapToRuntimeResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
    });

    expect(result).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
      binaryBody: undefined,
    });
  });

  it("maps binary response", () => {
    const buf = Buffer.from("binary");
    const result = mapToRuntimeResponse({
      status: 200,
      binaryBody: buf,
    });

    expect(result.status).toBe(200);
    expect(result.body).toBeUndefined();
    expect(result.binaryBody).toBe(buf);
  });

  it("maps a minimal response (status only)", () => {
    const result = mapToRuntimeResponse({ status: 204 });

    expect(result).toEqual({
      status: 204,
      headers: undefined,
      body: undefined,
      binaryBody: undefined,
    });
  });
});

describe("mapWebSocketMessage", () => {
  function makeWsInfo(overrides: Partial<JsWebSocketMessageInfo> = {}): JsWebSocketMessageInfo {
    return {
      messageType: "text",
      eventType: "message" as JsWebSocketEventType,
      connectionId: "conn-123",
      messageId: "msg-456",
      ...overrides,
    };
  }

  it("maps basic fields from JsWebSocketMessageInfo", () => {
    const result = mapWebSocketMessage(makeWsInfo());

    expect(result).toEqual({
      messageType: "text",
      eventType: "message",
      connectionId: "conn-123",
      messageId: "msg-456",
      jsonBody: undefined,
      binaryBody: undefined,
      requestContext: undefined,
      traceContext: null,
    });
  });

  it("passes through jsonBody", () => {
    const result = mapWebSocketMessage(makeWsInfo({ jsonBody: { action: "ping" } }));
    expect(result.jsonBody).toEqual({ action: "ping" });
  });

  it("passes through binaryBody", () => {
    const buf = Buffer.from("binary data");
    const result = mapWebSocketMessage(makeWsInfo({ binaryBody: buf }));
    expect(result.binaryBody).toBe(buf);
  });

  it("passes through traceContext when provided", () => {
    const tc = { traceparent: "00-trace-span-01" };
    const result = mapWebSocketMessage(makeWsInfo({ traceContext: tc }));
    expect(result.traceContext).toEqual(tc);
  });

  it("defaults traceContext to null when not provided", () => {
    const result = mapWebSocketMessage(makeWsInfo());
    expect(result.traceContext).toBeNull();
  });

  it("maps requestContext with flattened headers and query", () => {
    const result = mapWebSocketMessage(
      makeWsInfo({
        requestContext: {
          requestId: "req-1",
          requestTime: 1700000000,
          path: "/chat",
          protocolVersion: "13",
          headers: { host: ["example.com"], "x-custom": ["a", "b"] },
          userAgent: "TestAgent/1.0",
          clientIp: "127.0.0.1",
          query: { room: ["general"], tag: ["red", "blue"] },
          cookies: { session: "abc" },
          auth: { sub: "user-1" },
          traceContext: { traceparent: "00-trace-span-01" },
        },
      }),
    );

    expect(result.requestContext).toEqual({
      requestId: "req-1",
      requestTime: 1700000000,
      path: "/chat",
      protocolVersion: "13",
      headers: { host: "example.com", "x-custom": ["a", "b"] },
      userAgent: "TestAgent/1.0",
      clientIp: "127.0.0.1",
      query: { room: "general", tag: ["red", "blue"] },
      cookies: { session: "abc" },
      auth: { sub: "user-1" },
      traceContext: { traceparent: "00-trace-span-01" },
    });
  });

  it("maps requestContext without optional fields", () => {
    const result = mapWebSocketMessage(
      makeWsInfo({
        requestContext: {
          requestId: "req-2",
          requestTime: 1700000001,
          path: "/ws",
          protocolVersion: "13",
          headers: {},
          clientIp: "10.0.0.1",
          query: {},
          cookies: {},
        },
      }),
    );

    expect(result.requestContext).toEqual({
      requestId: "req-2",
      requestTime: 1700000001,
      path: "/ws",
      protocolVersion: "13",
      headers: {},
      userAgent: undefined,
      clientIp: "10.0.0.1",
      query: {},
      cookies: {},
      auth: undefined,
      traceContext: undefined,
    });
  });

  it("maps connect event type", () => {
    const result = mapWebSocketMessage(makeWsInfo({ eventType: "connect" as JsWebSocketEventType }));
    expect(result.eventType).toBe("connect");
  });

  it("maps disconnect event type", () => {
    const result = mapWebSocketMessage(makeWsInfo({ eventType: "disconnect" as JsWebSocketEventType}));
    expect(result.eventType).toBe("disconnect");
  });
});

describe("mapConsumerEventInput", () => {
  function makeConsumerInput(
    overrides: Partial<JsConsumerEventInput> = {},
  ): JsConsumerEventInput {
    return {
      handlerTag: "source::orders::processOrders",
      messages: [
        {
          messageId: "msg-1",
          body: '{"order":"abc"}',
          source: "arn:aws:sqs:us-east-1:123456:orders",
          messageAttributes: { type: "order" },
          vendor: { receiptHandle: "rh-1" },
        },
      ],
      vendor: { eventSourceArn: "arn:aws:sqs:us-east-1:123456:orders" },
      ...overrides,
    };
  }

  it("maps all fields from JsConsumerEventInput to ConsumerEventInput", () => {
    const result = mapConsumerEventInput(makeConsumerInput());

    expect(result.handlerTag).toBe("source::orders::processOrders");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      messageId: "msg-1",
      body: '{"order":"abc"}',
      source: "arn:aws:sqs:us-east-1:123456:orders",
      messageAttributes: { type: "order" },
      vendor: { receiptHandle: "rh-1" },
    });
    expect(result.vendor).toEqual({ eventSourceArn: "arn:aws:sqs:us-east-1:123456:orders" });
  });

  it("maps multiple messages", () => {
    const result = mapConsumerEventInput(
      makeConsumerInput({
        messages: [
          { messageId: "m-1", body: "a", source: "q", messageAttributes: {}, vendor: {} },
          { messageId: "m-2", body: "b", source: "q", messageAttributes: {}, vendor: {} },
          { messageId: "m-3", body: "c", source: "q", messageAttributes: {}, vendor: {} },
        ],
      }),
    );

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.messageId)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("passes through traceContext when provided", () => {
    const tc = { traceparent: "00-abc-def-01" };
    const result = mapConsumerEventInput(makeConsumerInput({ traceContext: tc }));
    expect(result.traceContext).toEqual(tc);
  });

  it("defaults traceContext to null when not provided", () => {
    const result = mapConsumerEventInput(makeConsumerInput());
    expect(result.traceContext).toBeNull();
  });

  it("handles empty messages array", () => {
    const result = mapConsumerEventInput(makeConsumerInput({ messages: [] }));
    expect(result.messages).toEqual([]);
  });
});

describe("mapScheduleEventInput", () => {
  function makeScheduleInput(
    overrides: Partial<JsScheduleEventInput> = {},
  ): JsScheduleEventInput {
    return {
      handlerTag: "source::maint::daily",
      scheduleId: "daily-cleanup",
      messageId: "msg-1",
      schedule: "rate(1 day)",
      input: undefined,
      vendor: {},
      ...overrides,
    };
  }

  it("maps all fields from JsScheduleEventInput to ScheduleEventInput", () => {
    const result = mapScheduleEventInput(makeScheduleInput());

    expect(result).toEqual({
      handlerTag: "source::maint::daily",
      scheduleId: "daily-cleanup",
      messageId: "msg-1",
      schedule: "rate(1 day)",
      input: undefined,
      vendor: {},
      traceContext: null,
    });
  });

  it("passes through input payload", () => {
    const result = mapScheduleEventInput(
      makeScheduleInput({ input: { key: "value" } }),
    );
    expect(result.input).toEqual({ key: "value" });
  });

  it("passes through traceContext when provided", () => {
    const tc = { traceparent: "00-abc-def-01" };
    const result = mapScheduleEventInput(makeScheduleInput({ traceContext: tc }));
    expect(result.traceContext).toEqual(tc);
  });

  it("defaults traceContext to null when not provided", () => {
    const result = mapScheduleEventInput(makeScheduleInput());
    expect(result.traceContext).toBeNull();
  });

  it("passes through vendor data", () => {
    const vendor = { eventArn: "arn:aws:events:us-east-1:123456:rule/daily" };
    const result = mapScheduleEventInput(makeScheduleInput({ vendor }));
    expect(result.vendor).toEqual(vendor);
  });

  it("maps cron schedule expression", () => {
    const result = mapScheduleEventInput(
      makeScheduleInput({ schedule: "cron(0 12 * * ? *)" }),
    );
    expect(result.schedule).toBe("cron(0 12 * * ? *)");
  });
});

describe("mapToNapiEventResult", () => {
  it("maps a successful result", () => {
    const result = mapToNapiEventResult({ success: true });

    expect(result).toEqual({
      success: true,
      failures: undefined,
      errorMessage: undefined,
    });
  });

  it("maps a failed result with errorMessage", () => {
    const result = mapToNapiEventResult({
      success: false,
      errorMessage: "something went wrong",
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("something went wrong");
  });

  it("maps partial failures", () => {
    const result = mapToNapiEventResult({
      success: false,
      failures: [
        { messageId: "msg-1", errorMessage: "parse error" },
        { messageId: "msg-2" },
      ],
    });

    expect(result.failures).toHaveLength(2);
    expect(result.failures![0]).toEqual({ messageId: "msg-1", errorMessage: "parse error" });
    expect(result.failures![1]).toEqual({ messageId: "msg-2", errorMessage: undefined });
  });

  it("passes through all fields together", () => {
    const result = mapToNapiEventResult({
      success: false,
      failures: [{ messageId: "msg-1", errorMessage: "bad" }],
      errorMessage: "partial failure",
    });

    expect(result).toEqual({
      success: false,
      failures: [{ messageId: "msg-1", errorMessage: "bad" }],
      errorMessage: "partial failure",
    });
  });
});
