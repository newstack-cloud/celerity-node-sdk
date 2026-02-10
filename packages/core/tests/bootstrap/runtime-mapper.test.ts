import { describe, it, expect } from "vitest";
import {
  mapRuntimeRequest,
  mapToRuntimeResponse,
  flattenMultiValueRecord,
} from "../../src/bootstrap/runtime-mapper";

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
