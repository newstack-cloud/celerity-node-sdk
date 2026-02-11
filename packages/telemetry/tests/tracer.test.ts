import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStartSpan = vi.fn();
const mockSetSpan = vi.fn();
const mockActive = vi.fn();
const mockContextWith = vi.fn();

const mockSpan = {
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
};

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({ startSpan: mockStartSpan }),
    setSpan: mockSetSpan,
  },
  context: {
    active: mockActive,
    with: mockContextWith,
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

const { OTelTracer, OTelSpan } = await import("../src/tracer");

describe("OTelSpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delegate setAttribute to OTel span", () => {
    const span = new OTelSpan(mockSpan as never);
    span.setAttribute("key", "value");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("key", "value");
  });

  it("should delegate setAttributes to OTel span", () => {
    const span = new OTelSpan(mockSpan as never);
    span.setAttributes({ a: 1, b: true });
    expect(mockSpan.setAttributes).toHaveBeenCalledWith({ a: 1, b: true });
  });

  it("should record error with exception and ERROR status", () => {
    const span = new OTelSpan(mockSpan as never);
    const err = new Error("test error");
    span.recordError(err);
    expect(mockSpan.recordException).toHaveBeenCalledWith(err);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: "test error" });
  });

  it("should set OK status", () => {
    const span = new OTelSpan(mockSpan as never);
    span.setOk();
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
  });

  it("should delegate end()", () => {
    const span = new OTelSpan(mockSpan as never);
    span.end();
    expect(mockSpan.end).toHaveBeenCalled();
  });
});

describe("OTelTracer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartSpan.mockReturnValue(mockSpan);
    mockActive.mockReturnValue({});
    mockSetSpan.mockReturnValue({ _ctx: true });
    mockContextWith.mockImplementation((_ctx, fn) => fn());
  });

  it("should create a span with startSpan", () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan("myOp", { key: "val" });

    expect(mockStartSpan).toHaveBeenCalledWith("myOp", { attributes: { key: "val" } });
    expect(span).toBeInstanceOf(OTelSpan);
  });

  it("should execute fn within withSpan and set OK on success", async () => {
    const tracer = new OTelTracer();
    const result = await tracer.withSpan("op", async (span) => {
      expect(span).toBeInstanceOf(OTelSpan);
      return "done";
    });

    expect(result).toBe("done");
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it("should set ERROR status and record exception on failure", async () => {
    const tracer = new OTelTracer();
    const error = new Error("boom");

    await expect(
      tracer.withSpan("op", async () => {
        throw error;
      }),
    ).rejects.toThrow("boom");

    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2 }); // ERROR
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it("should pass attributes to startSpan in withSpan", async () => {
    const tracer = new OTelTracer();
    await tracer.withSpan("op", async () => "ok", { custom: "attr" });

    expect(mockStartSpan).toHaveBeenCalledWith("op", { attributes: { custom: "attr" } });
  });

  it("should propagate context with otelContext.with", async () => {
    const tracer = new OTelTracer();
    await tracer.withSpan("op", async () => "ok");

    expect(mockSetSpan).toHaveBeenCalled();
    expect(mockContextWith).toHaveBeenCalled();
  });
});
