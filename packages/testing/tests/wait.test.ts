import { describe, it, expect } from "vitest";
import { waitFor } from "../src/wait";

describe("waitFor", () => {
  it("should resolve immediately when predicate returns true", async () => {
    await waitFor(() => true);
  });

  it("should resolve immediately when async predicate returns true", async () => {
    await waitFor(async () => true);
  });

  it("should poll until predicate returns true", async () => {
    let calls = 0;
    await waitFor(() => {
      calls++;
      return calls >= 3;
    });
    expect(calls).toBe(3);
  });

  it("should throw when timeout expires", async () => {
    await expect(waitFor(() => false, { timeout: 200, interval: 50 })).rejects.toThrow(
      "waitFor timed out after 200ms",
    );
  });

  it("should use custom interval", async () => {
    let calls = 0;
    const start = Date.now();
    await waitFor(
      () => {
        calls++;
        return calls >= 3;
      },
      { interval: 50 },
    );
    const elapsed = Date.now() - start;
    // 2 waits of 50ms each (first call immediate, then 2 polls)
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it("should include timeout value in error message", async () => {
    await expect(waitFor(() => false, { timeout: 150, interval: 50 })).rejects.toThrow(
      "waitFor timed out after 150ms",
    );
  });
});
