import { describe, it, expect } from "vitest";
import { AwsSecretsManagerBackend } from "../../src/backends/aws-secrets-manager";

describe("AwsSecretsManagerBackend (integration)", () => {
  const backend = new AwsSecretsManagerBackend();

  it("should fetch and parse a JSON secret", async () => {
    const result = await backend.fetch("app/database-config");

    expect(result).toBeInstanceOf(Map);
    expect(result.get("DB_HOST")).toBe("rds.amazonaws.com");
    expect(result.get("DB_PORT")).toBe("3306");
    expect(result.get("DB_PASSWORD")).toBe("s3cret");
    expect(result.size).toBe(3);
  });

  it("should return an empty map for a binary secret with no SecretString", async () => {
    const result = await backend.fetch("app/binary-secret");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("should throw when the secret does not exist", async () => {
    await expect(backend.fetch("nonexistent/secret")).rejects.toThrow();
  });
});
