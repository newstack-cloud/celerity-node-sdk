import { describe, it, expect } from "vitest";
import { LocalConfigBackend } from "../../src/backends/local";

describe("LocalConfigBackend (integration)", () => {
  const backend = new LocalConfigBackend();

  it("should fetch config values from Valkey by store ID", async () => {
    const result = await backend.fetch("app/config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("DB_HOST")).toBe("db.example.com");
    expect(result.get("DB_PORT")).toBe("5432");
    expect(result.get("FEATURE_FLAG")).toBe("true");
    expect(result.size).toBe(3);
  });

  it("should return an empty map for a key with empty JSON object", async () => {
    const result = await backend.fetch("app/empty");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("should return an empty map when the key does not exist", async () => {
    const result = await backend.fetch("nonexistent/key");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("should coerce all values to strings", async () => {
    const result = await backend.fetch("app/config");

    for (const [, value] of result) {
      expect(typeof value).toBe("string");
    }
  });
});
