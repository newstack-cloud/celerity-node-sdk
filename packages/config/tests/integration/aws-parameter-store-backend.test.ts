import { describe, it, expect } from "vitest";
import { AwsParameterStoreBackend } from "../../src/backends/aws-parameter-store";

describe("AwsParameterStoreBackend (integration)", () => {
  const backend = new AwsParameterStoreBackend();

  it("should fetch all parameters under a path prefix", async () => {
    const result = await backend.fetch("/app/config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("DB_HOST")).toBe("rds.amazonaws.com");
    expect(result.get("DB_PORT")).toBe("5432");
    expect(result.get("API_KEY")).toBe("secret-key-123");
  });

  it("should fetch nested parameters recursively", async () => {
    const result = await backend.fetch("/app/config");

    expect(result.get("nested/DEEP_KEY")).toBe("deep-value");
  });

  it("should handle a trailing slash on storeId", async () => {
    const result = await backend.fetch("/app/config/");

    expect(result.get("DB_HOST")).toBe("rds.amazonaws.com");
  });

  it("should return an empty map when no parameters exist at path", async () => {
    const result = await backend.fetch("/nonexistent/path");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
