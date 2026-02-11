import { describe, it, expect } from "vitest";
import { NoopTracer, NOOP_SPAN } from "../src/noop";

describe("NOOP_SPAN", () => {
  it("should have no-op methods that do not throw", () => {
    expect(() => NOOP_SPAN.setAttribute("key", "value")).not.toThrow();
    expect(() => NOOP_SPAN.setAttributes({ a: 1, b: true })).not.toThrow();
    expect(() => NOOP_SPAN.recordError(new Error("test"))).not.toThrow();
    expect(() => NOOP_SPAN.setOk()).not.toThrow();
    expect(() => NOOP_SPAN.end()).not.toThrow();
  });
});

describe("NoopTracer", () => {
  it("should return NOOP_SPAN from startSpan", () => {
    const tracer = new NoopTracer();
    const span = tracer.startSpan();
    expect(span).toBe(NOOP_SPAN);
  });

  it("should execute fn in withSpan and return its result", async () => {
    const tracer = new NoopTracer();
    const result = await tracer.withSpan("test", (span) => {
      expect(span).toBe(NOOP_SPAN);
      return 42;
    });
    expect(result).toBe(42);
  });

  it("should handle async fn in withSpan", async () => {
    const tracer = new NoopTracer();
    const result = await tracer.withSpan("test", async () => {
      return "async-result";
    });
    expect(result).toBe("async-result");
  });

  it("should propagate errors from withSpan", async () => {
    const tracer = new NoopTracer();
    await expect(
      tracer.withSpan("test", () => {
        throw new Error("oops");
      }),
    ).rejects.toThrow("oops");
  });
});
