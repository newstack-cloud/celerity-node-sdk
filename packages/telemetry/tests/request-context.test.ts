import { describe, it, expect, vi } from "vitest";
import type { CelerityLogger } from "@celerity-sdk/types";
import { requestStore, getRequestLogger, ContextAwareLogger } from "../src/request-context";

function createMockLogger(label?: string): CelerityLogger & { _label?: string } {
  const logger: CelerityLogger & { _label?: string } = {
    _label: label,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(
      (name: string) =>
        ({
          _label: name,
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: vi.fn(),
          withContext: vi.fn(),
        }) as unknown as CelerityLogger,
    ),
    withContext: vi.fn(
      () =>
        ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: vi.fn(),
          withContext: vi.fn(),
        }) as unknown as CelerityLogger,
    ),
  };
  return logger;
}

describe("getRequestLogger", () => {
  it("should return undefined outside request context", () => {
    expect(getRequestLogger()).toBeUndefined();
  });

  it("should return the logger inside requestStore.run()", () => {
    const logger = createMockLogger("request");
    requestStore.run({ logger }, () => {
      expect(getRequestLogger()).toBe(logger);
    });
  });

  it("should propagate through nested async calls", async () => {
    const logger = createMockLogger("request");

    await requestStore.run({ logger }, async () => {
      // Simulate nested service call
      const innerResult = await (async () => {
        return getRequestLogger();
      })();
      expect(innerResult).toBe(logger);
    });
  });

  it("should return undefined after context exits", () => {
    const logger = createMockLogger("request");
    requestStore.run({ logger }, () => {
      // inside context
    });
    // outside context
    expect(getRequestLogger()).toBeUndefined();
  });

  it("should isolate between concurrent requests", async () => {
    const logger1 = createMockLogger("req1");
    const logger2 = createMockLogger("req2");

    const results = await Promise.all([
      requestStore.run({ logger: logger1 }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestLogger();
      }),
      requestStore.run({ logger: logger2 }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestLogger();
      }),
    ]);

    expect(results[0]).toBe(logger1);
    expect(results[1]).toBe(logger2);
  });
});

describe("ContextAwareLogger", () => {
  it("should delegate to root logger when outside request context", () => {
    const root = createMockLogger("root");
    const aware = new ContextAwareLogger(root);

    aware.info("test message", { key: "value" });

    expect(root.info).toHaveBeenCalledWith("test message", { key: "value" });
  });

  it("should delegate to request-scoped logger when inside context", () => {
    const root = createMockLogger("root");
    const request = createMockLogger("request");
    const aware = new ContextAwareLogger(root);

    requestStore.run({ logger: request }, () => {
      aware.info("test message");
    });

    expect(request.info).toHaveBeenCalledWith("test message", undefined);
    expect(root.info).not.toHaveBeenCalled();
  });

  it("should delegate all log level methods correctly", () => {
    const root = createMockLogger("root");
    const aware = new ContextAwareLogger(root);

    aware.debug("d");
    aware.info("i");
    aware.warn("w");
    aware.error("e");

    expect(root.debug).toHaveBeenCalledWith("d", undefined);
    expect(root.info).toHaveBeenCalledWith("i", undefined);
    expect(root.warn).toHaveBeenCalledWith("w", undefined);
    expect(root.error).toHaveBeenCalledWith("e", undefined);
  });

  it("should delegate child() to the current context logger", () => {
    const root = createMockLogger("root");
    const request = createMockLogger("request");
    const aware = new ContextAwareLogger(root);

    // Outside context — delegates to root
    aware.child("outside");
    expect(root.child).toHaveBeenCalledWith("outside", undefined);

    // Inside context — delegates to request-scoped
    requestStore.run({ logger: request }, () => {
      aware.child("inside", { key: "val" });
    });
    expect(request.child).toHaveBeenCalledWith("inside", { key: "val" });
  });

  it("should delegate withContext() to the current context logger", () => {
    const root = createMockLogger("root");
    const aware = new ContextAwareLogger(root);

    aware.withContext({ extra: true });
    expect(root.withContext).toHaveBeenCalledWith({ extra: true });
  });
});
