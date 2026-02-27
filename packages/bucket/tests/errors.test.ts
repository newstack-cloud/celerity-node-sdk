import { describe, it, expect } from "vitest";
import { BucketError } from "../src/errors";

describe("BucketError", () => {
  it("sets name, message, and bucket", () => {
    const error = new BucketError("something failed", "my-bucket");
    expect(error.name).toBe("BucketError");
    expect(error.message).toBe("something failed");
    expect(error.bucket).toBe("my-bucket");
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause via ES2022 cause", () => {
    const cause = new Error("S3 timeout");
    const error = new BucketError("put failed", "uploads", { cause });
    expect(error.cause).toBe(cause);
  });

  it("allows undefined cause", () => {
    const error = new BucketError("no cause", "data");
    expect(error.cause).toBeUndefined();
  });
});
