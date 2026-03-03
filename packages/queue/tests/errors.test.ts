import { describe, it, expect } from "vitest";
import { QueueError } from "../src/errors";

describe("QueueError", () => {
  it("sets name, message, and queue", () => {
    const error = new QueueError("something failed", "my-queue");
    expect(error.name).toBe("QueueError");
    expect(error.message).toBe("something failed");
    expect(error.queue).toBe("my-queue");
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause via ES2022 cause", () => {
    const cause = new Error("SQS timeout");
    const error = new QueueError("send failed", "orders", { cause });
    expect(error.cause).toBe(cause);
  });

  it("allows undefined cause", () => {
    const error = new QueueError("no cause", "events");
    expect(error.cause).toBeUndefined();
  });
});
