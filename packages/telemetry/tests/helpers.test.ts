import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getLogger, getTracer } from "../src/helpers";
import { LOGGER_TOKEN, TRACER_TOKEN } from "../src/tokens";

function createMockContainer(registry: Map<string, unknown>): ServiceContainer {
  return {
    resolve: vi.fn(async (token: string) => {
      if (!registry.has(token)) throw new Error(`Token ${token} not registered`);
      return registry.get(token);
    }) as unknown as ServiceContainer["resolve"],
    register: vi.fn(),
    has: vi.fn((token: string) => registry.has(token)),
    closeAll: vi.fn().mockResolvedValue(undefined),
  };
}

describe("getLogger", () => {
  it("should resolve CelerityLogger from container", async () => {
    const mockLogger = { info: vi.fn() };
    const container = createMockContainer(new Map([[LOGGER_TOKEN, mockLogger]]));

    const result = await getLogger(container);

    expect(result).toBe(mockLogger);
    expect(container.resolve).toHaveBeenCalledWith(LOGGER_TOKEN);
  });
});

describe("getTracer", () => {
  it("should resolve CelerityTracer from container", async () => {
    const mockTracer = { startSpan: vi.fn() };
    const container = createMockContainer(new Map([[TRACER_TOKEN, mockTracer]]));

    const result = await getTracer(container);

    expect(result).toBe(mockTracer);
    expect(container.resolve).toHaveBeenCalledWith(TRACER_TOKEN);
  });
});
