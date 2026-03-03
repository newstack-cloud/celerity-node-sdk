import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getQueue } from "../src/helpers";
import { queueToken, DEFAULT_QUEUE_TOKEN } from "../src/decorators";

function mockContainer(resolveImpl: (token: unknown) => unknown): ServiceContainer {
  return {
    resolve: vi.fn().mockImplementation((token: unknown) => Promise.resolve(resolveImpl(token))),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

describe("getQueue", () => {
  it("resolves the resource-specific token for a named resource", async () => {
    const fakeQueue = { name: "orders" };
    const container = mockContainer((token) =>
      token === queueToken("ordersQueue") ? fakeQueue : undefined,
    );

    const result = await getQueue(container, "ordersQueue");

    expect(result).toBe(fakeQueue);
    expect(container.resolve).toHaveBeenCalledWith(queueToken("ordersQueue"));
  });

  it("resolves the default token when no resource name is given", async () => {
    const fakeQueue = { name: "default" };
    const container = mockContainer((token) =>
      token === DEFAULT_QUEUE_TOKEN ? fakeQueue : undefined,
    );

    const result = await getQueue(container);

    expect(result).toBe(fakeQueue);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_QUEUE_TOKEN);
  });
});
