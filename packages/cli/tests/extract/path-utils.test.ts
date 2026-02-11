import { describe, it, expect } from "vitest";
import { joinHandlerPath } from "../../src/extract/path-utils";

describe("joinHandlerPath (re-export)", () => {
  it("re-exports joinHandlerPath from @celerity-sdk/common", () => {
    expect(typeof joinHandlerPath).toBe("function");
    expect(joinHandlerPath("/api", "/users")).toBe("/api/users");
  });
});
