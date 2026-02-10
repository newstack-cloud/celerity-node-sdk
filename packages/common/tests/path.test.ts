import { describe, it, expect } from "vitest";
import { joinHandlerPath } from "../src/path";

describe("joinHandlerPath", () => {
  it("joins a prefix and method path", () => {
    expect(joinHandlerPath("/orders", "/{orderId}")).toBe("/orders/{orderId}");
  });

  it("normalizes double slashes", () => {
    expect(joinHandlerPath("/api/", "/users")).toBe("/api/users");
  });

  it("handles root prefix with method path", () => {
    expect(joinHandlerPath("/", "/health")).toBe("/health");
  });

  it("handles empty prefix with method path", () => {
    expect(joinHandlerPath("", "/health")).toBe("/health");
  });

  it("handles prefix with root method path", () => {
    expect(joinHandlerPath("/orders", "/")).toBe("/orders");
  });

  it("handles both being root", () => {
    expect(joinHandlerPath("/", "/")).toBe("/");
  });

  it("joins multi-segment prefix with method path", () => {
    expect(joinHandlerPath("/api/v1", "/users")).toBe("/api/v1/users");
  });

  it("handles prefix and method path without leading slashes", () => {
    expect(joinHandlerPath("api", "users")).toBe("/api/users");
  });

  it("strips trailing slash from result", () => {
    expect(joinHandlerPath("/api", "/")).toBe("/api");
  });

  it("handles wildcard paths", () => {
    expect(joinHandlerPath("/api", "/{proxy+}")).toBe("/api/{proxy+}");
  });
});
