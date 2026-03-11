import { describe, it, expect } from "vitest";
import { CacheError } from "../src/errors";

describe("CacheError", () => {
  it("sets name, message, and cache resource name", () => {
    const error = new CacheError("something failed", "my-cache");
    expect(error.name).toBe("CacheError");
    expect(error.message).toBe("something failed");
    expect(error.cache).toBe("my-cache");
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause via ES2022 cause", () => {
    const cause = new Error("Redis timeout");
    const error = new CacheError("get failed", "cache", { cause });
    expect(error.cause).toBe(cause);
  });

  it("allows undefined cause", () => {
    const error = new CacheError("no cause", "cache");
    expect(error.cause).toBeUndefined();
  });
});
