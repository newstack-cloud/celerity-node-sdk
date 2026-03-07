import { describe, it, expect } from "vitest";
import { TopicError } from "../src/errors";

describe("TopicError", () => {
  it("sets name, message, and topic properties", () => {
    const error = new TopicError("something failed", "arn:aws:sns:us-east-1:123:my-topic");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TopicError");
    expect(error.message).toBe("something failed");
    expect(error.topic).toBe("arn:aws:sns:us-east-1:123:my-topic");
  });

  it("chains an underlying cause", () => {
    const cause = new Error("network timeout");
    const error = new TopicError("publish failed", "my-channel", { cause });

    expect(error.cause).toBe(cause);
  });

  it("works without a cause", () => {
    const error = new TopicError("publish failed", "my-channel");

    expect(error.cause).toBeUndefined();
  });
});
