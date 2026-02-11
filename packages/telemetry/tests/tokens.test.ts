import { describe, it, expect } from "vitest";
import { LOGGER_TOKEN, TRACER_TOKEN } from "../src/tokens";

describe("tokens", () => {
  it("should export LOGGER_TOKEN as 'CelerityLogger'", () => {
    expect(LOGGER_TOKEN).toBe("CelerityLogger");
  });

  it("should export TRACER_TOKEN as 'CelerityTracer'", () => {
    expect(TRACER_TOKEN).toBe("CelerityTracer");
  });
});
