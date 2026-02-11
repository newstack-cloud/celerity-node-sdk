import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpRequest } from "@celerity-sdk/types";

vi.mock("@opentelemetry/api", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    propagation: {
      extract: vi.fn(),
    },
  };
});

// Import after mock setup
const { extractTraceContext } = await import("../src/context");
const { propagation, ROOT_CONTEXT } = await import("@opentelemetry/api");
const mockExtract = propagation.extract as ReturnType<typeof vi.fn>;

function createRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    path: "/test",
    headers: {},
    query: {},
    pathParams: {},
    cookies: {},
    binaryBody: null,
    contentType: 'application/json',
    textBody: null,
    requestId: "req-1",
    requestTime: new Date().toISOString(),
    traceContext: null,
    auth: null,
    clientIp: null,
    userAgent: null,
    matchedRoute: null,
    ...overrides,
  };
}

describe("extractTraceContext", () => {
  beforeEach(() => {
    mockExtract.mockClear();
  });

  it("should return ROOT_CONTEXT when traceContext is null", () => {
    const request = createRequest({ traceContext: null });
    const result = extractTraceContext(request);
    expect(result).toBe(ROOT_CONTEXT);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("should call propagation.extract with the traceContext map", () => {
    const fakeContext = { _type: "extracted" };
    mockExtract.mockReturnValue(fakeContext);

    const traceContext = { traceparent: "00-abc-def-01" };
    const request = createRequest({ traceContext });

    const result = extractTraceContext(request);

    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect(mockExtract.mock.calls[0]![1]).toBe(traceContext);
    expect(result).toBe(fakeContext);
  });

  it("should pass X-Ray trace context map", () => {
    const fakeContext = { _type: "xray" };
    mockExtract.mockReturnValue(fakeContext);

    const traceContext = {
      "x-amzn-trace-id": "Root=1-abc-def;Parent=ghi;Sampled=1",
    };
    const request = createRequest({ traceContext });

    const result = extractTraceContext(request);

    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect(mockExtract.mock.calls[0]![1]).toBe(traceContext);
    expect(result).toBe(fakeContext);
  });
});
