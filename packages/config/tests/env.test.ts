import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CelerityConfig } from "../src/env";

/**
 * Collects all CELERITY_* keys currently in process.env so they can
 * be cleaned up after each test, preventing cross-test pollution.
 */
function celerityKeys(): string[] {
  return Object.keys(process.env).filter((k) => k.startsWith("CELERITY_"));
}

describe("CelerityConfig", () => {
  /** Snapshot of env keys that existed before the test, so we only remove keys we added. */
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
  // getAppVar
  // ---------------------------------------------------------------
  describe("getAppVar", () => {
    it("returns the value of a CELERITY_APP_ prefixed env var", () => {
      // Arrange
      process.env.CELERITY_APP_DATABASE_URL = "postgres://localhost/test";

      // Act
      const result = CelerityConfig.getAppVar("DATABASE_URL");

      // Assert
      expect(result).toBe("postgres://localhost/test");
    });

    it("returns undefined when the env var does not exist", () => {
      // Arrange — no env var set

      // Act
      const result = CelerityConfig.getAppVar("NONEXISTENT_KEY");

      // Assert
      expect(result).toBeUndefined();
    });

    it("returns an empty string when the env var is set to an empty string", () => {
      // Arrange
      process.env.CELERITY_APP_EMPTY = "";

      // Act
      const result = CelerityConfig.getAppVar("EMPTY");

      // Assert
      expect(result).toBe("");
    });
  });

  // ---------------------------------------------------------------
  // getAllAppVars
  // ---------------------------------------------------------------
  describe("getAllAppVars", () => {
    it("returns all CELERITY_APP_ vars with the prefix stripped from keys", () => {
      // Arrange
      process.env.CELERITY_APP_HOST = "0.0.0.0";
      process.env.CELERITY_APP_PORT = "8080";

      // Act
      const result = CelerityConfig.getAllAppVars();

      // Assert
      expect(result).toMatchObject({
        HOST: "0.0.0.0",
        PORT: "8080",
      });
    });

    it("returns an empty object when no CELERITY_APP_ vars exist", () => {
      // Arrange — ensure no CELERITY_APP_ vars are present
      for (const key of Object.keys(process.env)) {
        if (key.startsWith("CELERITY_APP_")) {
          delete process.env[key];
        }
      }

      // Act
      const result = CelerityConfig.getAllAppVars();

      // Assert
      expect(result).toEqual({});
    });

    it("does not include CELERITY_SECRET_ or CELERITY_VARIABLE_ vars", () => {
      // Arrange
      process.env.CELERITY_APP_INCLUDED = "yes";
      process.env.CELERITY_SECRET_EXCLUDED = "secret-value";
      process.env.CELERITY_VARIABLE_EXCLUDED = "variable-value";

      // Act
      const result = CelerityConfig.getAllAppVars();

      // Assert
      expect(result).toHaveProperty("INCLUDED", "yes");
      expect(Object.keys(result)).not.toContain("SECRET_EXCLUDED");
      expect(Object.keys(result)).not.toContain("VARIABLE_EXCLUDED");
      expect(Object.keys(result)).not.toContain("EXCLUDED");
    });
  });

  // ---------------------------------------------------------------
  // getSecret
  // ---------------------------------------------------------------
  describe("getSecret", () => {
    it("returns the value of a CELERITY_SECRET_ prefixed env var", () => {
      // Arrange
      process.env.CELERITY_SECRET_API_KEY = "sk-abc123";

      // Act
      const result = CelerityConfig.getSecret("API_KEY");

      // Assert
      expect(result).toBe("sk-abc123");
    });

    it("returns undefined when the secret does not exist", () => {
      // Arrange — no env var set

      // Act
      const result = CelerityConfig.getSecret("MISSING_SECRET");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // getVariable
  // ---------------------------------------------------------------
  describe("getVariable", () => {
    it("returns the value of a CELERITY_VARIABLE_ prefixed env var", () => {
      // Arrange
      process.env.CELERITY_VARIABLE_REGION = "us-east-1";

      // Act
      const result = CelerityConfig.getVariable("REGION");

      // Assert
      expect(result).toBe("us-east-1");
    });

    it("returns undefined when the variable does not exist", () => {
      // Arrange — no env var set

      // Act
      const result = CelerityConfig.getVariable("MISSING_VARIABLE");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // getPlatform
  // ---------------------------------------------------------------
  describe("getPlatform", () => {
    it('returns "aws" when CELERITY_PLATFORM is "aws"', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "aws";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("aws");
    });

    it('returns "gcp" when CELERITY_PLATFORM is "gcp"', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "gcp";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("gcp");
    });

    it('returns "azure" when CELERITY_PLATFORM is "azure"', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "azure";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("azure");
    });

    it('returns "local" when CELERITY_PLATFORM is "local"', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "local";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("local");
    });

    it("is case-insensitive (e.g. AWS -> aws)", () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "AWS";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("aws");
    });

    it("handles mixed case (e.g. Azure -> azure)", () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "Azure";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("azure");
    });

    it('returns "other" for an unrecognized platform string', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "digitalocean";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("other");
    });

    it('returns "other" when CELERITY_PLATFORM is not set', () => {
      // Arrange
      delete process.env.CELERITY_PLATFORM;

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("other");
    });

    it('returns "other" when CELERITY_PLATFORM is an empty string', () => {
      // Arrange
      process.env.CELERITY_PLATFORM = "";

      // Act
      const result = CelerityConfig.getPlatform();

      // Assert
      expect(result).toBe("other");
    });
  });
});
