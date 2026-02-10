import { describe, it, expect } from "vitest";

describe("@celerity-sdk/types", () => {
  it("should be importable", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
  });
});
