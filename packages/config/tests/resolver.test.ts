import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../src/resolver";

/**
 * Collects all CELERITY_* keys currently in process.env so they can
 * be cleaned up after each test, preventing cross-test pollution.
 */
function celerityKeys(): string[] {
  return Object.keys(process.env).filter((k) => k.startsWith("CELERITY_"));
}

describe("resolveConfig", () => {
  let preExistingKeys: Set<string>;

  beforeEach(() => {
    preExistingKeys = new Set(celerityKeys());
  });

  afterEach(() => {
    for (const key of celerityKeys()) {
      if (!preExistingKeys.has(key)) {
        delete process.env[key];
      }
    }
  });

  // ---------------------------------------------------------------
  // Provider detection
  // ---------------------------------------------------------------
  describe("provider resolution", () => {
    it("uses the explicit PROVIDER app var when present (resourceType only)", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_PROVIDER = "aws";

      // Act
      const result = resolveConfig("database");

      // Assert
      expect(result.provider).toBe("aws");
    });

    it("uses the explicit PROVIDER app var when present (resourceType + resourceName)", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_ORDERS_PROVIDER = "gcp";

      // Act
      const result = resolveConfig("database", "orders");

      // Assert
      expect(result.provider).toBe("gcp");
    });

    it("falls back to platform when no PROVIDER var exists and platform is recognized", () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "azure";

      // Act
      const result = resolveConfig("cache");

      // Assert
      expect(result.provider).toBe("azure");
    });

    it('falls back to "unknown" when no PROVIDER var exists and platform is unrecognized', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "custom-cloud";

      // Act
      const result = resolveConfig("cache");

      // Assert
      expect(result.provider).toBe("unknown");
    });

    it('falls back to "unknown" when no PROVIDER var exists and platform is unset', () => {
      // Arrange
      delete process.env.CELERITY_PLATFORM;

      // Act
      const result = resolveConfig("queue");

      // Assert
      expect(result.provider).toBe("unknown");
    });
  });

  // ---------------------------------------------------------------
  // Property collection (resourceType only)
  // ---------------------------------------------------------------
  describe("property collection with resourceType only", () => {
    it("collects matching app vars as properties with the prefix stripped", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_HOST = "db.example.com";
      process.env.CELERITY_APP_DATABASE_PORT = "5432";
      process.env.CELERITY_APP_DATABASE_NAME = "mydb";

      // Act
      const result = resolveConfig("database");

      // Assert
      expect(result.properties).toEqual({
        HOST: "db.example.com",
        PORT: "5432",
        NAME: "mydb",
      });
    });

    it("does not include the PROVIDER key in properties", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_PROVIDER = "aws";
      process.env.CELERITY_APP_DATABASE_HOST = "db.example.com";

      // Act
      const result = resolveConfig("database");

      // Assert
      expect(result.properties).toEqual({ HOST: "db.example.com" });
      expect(result.properties).not.toHaveProperty("PROVIDER");
    });

    it("does not include vars from a different resource type", () => {
      // Arrange
      process.env.CELERITY_APP_CACHE_TTL = "300";
      process.env.CELERITY_APP_DATABASE_HOST = "db.example.com";

      // Act
      const result = resolveConfig("cache");

      // Assert
      expect(result.properties).toEqual({ TTL: "300" });
      expect(result.properties).not.toHaveProperty("DATABASE_HOST");
    });

    it("returns empty properties when no matching app vars exist", () => {
      // Arrange — no matching env vars

      // Act
      const result = resolveConfig("storage");

      // Assert
      expect(result.properties).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // Property collection (resourceType + resourceName)
  // ---------------------------------------------------------------
  describe("property collection with resourceType and resourceName", () => {
    it("uses the compound prefix resourceType_resourceName", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_ORDERS_HOST = "orders-db.example.com";
      process.env.CELERITY_APP_DATABASE_ORDERS_PORT = "3306";

      // Act
      const result = resolveConfig("database", "orders");

      // Assert
      expect(result.properties).toEqual({
        HOST: "orders-db.example.com",
        PORT: "3306",
      });
    });

    it("does not include vars that only match the resourceType prefix", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_HOST = "generic-db.example.com";
      process.env.CELERITY_APP_DATABASE_ORDERS_HOST = "orders-db.example.com";

      // Act
      const result = resolveConfig("database", "orders");

      // Assert
      expect(result.properties).toEqual({ HOST: "orders-db.example.com" });
    });

    it("extracts PROVIDER from the compound prefix", () => {
      // Arrange
      process.env.CELERITY_APP_CACHE_SESSION_PROVIDER = "aws";
      process.env.CELERITY_APP_CACHE_SESSION_TTL = "600";

      // Act
      const result = resolveConfig("cache", "session");

      // Assert
      expect(result.provider).toBe("aws");
      expect(result.properties).toEqual({ TTL: "600" });
    });
  });

  // ---------------------------------------------------------------
  // Case handling
  // ---------------------------------------------------------------
  describe("case conversion", () => {
    it("converts resourceType to uppercase for prefix matching", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_HOST = "db.example.com";

      // Act
      const result = resolveConfig("database");

      // Assert
      expect(result.properties).toEqual({ HOST: "db.example.com" });
    });

    it("converts resourceName to uppercase for prefix matching", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_ORDERS_HOST = "orders-db.example.com";

      // Act
      const result = resolveConfig("database", "orders");

      // Assert
      expect(result.properties).toEqual({ HOST: "orders-db.example.com" });
    });

    it("handles mixed-case inputs correctly", () => {
      // Arrange
      process.env.CELERITY_APP_CACHE_USERDATA_REGION = "us-west-2";

      // Act
      const result = resolveConfig("Cache", "UserData");

      // Assert
      expect(result.properties).toEqual({ REGION: "us-west-2" });
    });
  });

  // ---------------------------------------------------------------
  // Return shape
  // ---------------------------------------------------------------
  describe("return shape", () => {
    it("always returns an object with provider (string) and properties (Record)", () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "local";

      // Act
      const result = resolveConfig("anything");

      // Assert
      expect(result).toHaveProperty("provider");
      expect(result).toHaveProperty("properties");
      expect(typeof result.provider).toBe("string");
      expect(typeof result.properties).toBe("object");
    });
  });
});
