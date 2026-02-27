import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getBucket } from "../src/helpers";
import { bucketToken, DEFAULT_BUCKET_TOKEN } from "../src/decorators";

function mockContainer(resolveImpl: (token: unknown) => unknown): ServiceContainer {
  return {
    resolve: vi.fn().mockImplementation((token: unknown) => Promise.resolve(resolveImpl(token))),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

describe("getBucket", () => {
  it("resolves the resource-specific token for a named resource", async () => {
    const fakeBucket = { name: "images" };
    const container = mockContainer((token) =>
      token === bucketToken("imagesBucket") ? fakeBucket : undefined,
    );

    const result = await getBucket(container, "imagesBucket");

    expect(result).toBe(fakeBucket);
    expect(container.resolve).toHaveBeenCalledWith(bucketToken("imagesBucket"));
  });

  it("resolves the default token when no resource name is given", async () => {
    const fakeBucket = { name: "default" };
    const container = mockContainer((token) =>
      token === DEFAULT_BUCKET_TOKEN ? fakeBucket : undefined,
    );

    const result = await getBucket(container);

    expect(result).toBe(fakeBucket);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_BUCKET_TOKEN);
  });
});
