import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getTopic } from "../src/helpers";
import { topicToken, DEFAULT_TOPIC_TOKEN } from "../src/decorators";

function mockContainer(): ServiceContainer {
  return {
    resolve: vi.fn().mockResolvedValue({ __topic: true }),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

describe("getTopic", () => {
  it("resolves a named topic token from the container", async () => {
    const container = mockContainer();

    await getTopic(container, "orderEvents");

    expect(container.resolve).toHaveBeenCalledWith(topicToken("orderEvents"));
  });

  it("resolves the default topic token when no name is provided", async () => {
    const container = mockContainer();

    await getTopic(container);

    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_TOPIC_TOKEN);
  });
});
