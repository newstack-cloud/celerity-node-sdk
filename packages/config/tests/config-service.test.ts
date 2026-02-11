import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigService, ConfigNamespace } from "../src/config-service";
import type { ConfigBackend } from "../src/backends/types";

function createMockBackend(values: Record<string, string> = {}): ConfigBackend {
  return {
    fetch: vi.fn().mockResolvedValue(new Map(Object.entries(values))),
  };
}

describe("ConfigNamespace", () => {
  let backend: ConfigBackend;
  let namespace: ConfigNamespace;

  beforeEach(() => {
    backend = createMockBackend({ DB_HOST: "localhost", DB_PORT: "5432" });
    namespace = new ConfigNamespace(backend, "test-store", null);
  });

  describe("#get()", () => {
    it("should return a value by key", async () => {
      const value = await namespace.get("DB_HOST");
      expect(value).toBe("localhost");
    });

    it("should return undefined for missing key", async () => {
      const value = await namespace.get("MISSING");
      expect(value).toBeUndefined();
    });

    it("should fetch lazily on first access", async () => {
      expect(backend.fetch).not.toHaveBeenCalled();
      await namespace.get("DB_HOST");
      expect(backend.fetch).toHaveBeenCalledOnce();
      expect(backend.fetch).toHaveBeenCalledWith("test-store");
    });

    it("should cache values after first fetch", async () => {
      await namespace.get("DB_HOST");
      await namespace.get("DB_PORT");
      expect(backend.fetch).toHaveBeenCalledOnce();
    });
  });

  describe("#getOrThrow()", () => {
    it("should return value for existing key", async () => {
      const value = await namespace.getOrThrow("DB_HOST");
      expect(value).toBe("localhost");
    });

    it("should throw for missing key", async () => {
      await expect(namespace.getOrThrow("MISSING")).rejects.toThrow(
        'Config key "MISSING" not found in namespace',
      );
    });
  });

  describe("#getAll()", () => {
    it("should return all values as a record", async () => {
      const all = await namespace.getAll();
      expect(all).toEqual({ DB_HOST: "localhost", DB_PORT: "5432" });
    });
  });

  describe("#parse()", () => {
    it("should parse values with a schema", async () => {
      const schema = {
        parse: (data: unknown) => {
          const record = data as Record<string, string>;
          return { host: record.DB_HOST, port: Number(record.DB_PORT) };
        },
      };

      const parsed = await namespace.parse(schema);
      expect(parsed).toEqual({ host: "localhost", port: 5432 });
    });

    it("should propagate schema validation errors", async () => {
      const schema = {
        parse: () => {
          throw new Error("Validation failed");
        },
      };

      await expect(namespace.parse(schema)).rejects.toThrow("Validation failed");
    });
  });

  describe("lazy refresh", () => {
    it("should not re-fetch when refreshIntervalMs is null", async () => {
      const ns = new ConfigNamespace(backend, "test-store", null);
      await ns.get("DB_HOST");
      await ns.get("DB_HOST");
      expect(backend.fetch).toHaveBeenCalledOnce();
    });

    it("should trigger background refresh when stale", async () => {
      // Use refreshIntervalMs=0 so it's immediately stale after first fetch
      const ns = new ConfigNamespace(backend, "test-store", 0);

      await ns.get("DB_HOST");
      expect(backend.fetch).toHaveBeenCalledOnce();

      // Second access — stale, triggers background refresh
      await ns.get("DB_HOST");
      expect(backend.fetch).toHaveBeenCalledTimes(2);
    });

    it("should serve stale values during background refresh", async () => {
      vi.useRealTimers();

      const slowBackend: ConfigBackend = {
        fetch: vi
          .fn()
          .mockResolvedValueOnce(new Map([["KEY", "old"]]))
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(new Map([["KEY", "new"]])), 100)),
          ),
      };

      const ns = new ConfigNamespace(slowBackend, "store", 0);

      // First fetch — blocking
      const first = await ns.get("KEY");
      expect(first).toBe("old");

      // Second fetch — stale, triggers background refresh, returns old value
      const second = await ns.get("KEY");
      expect(second).toBe("old");

      // Wait for background refresh to complete
      await new Promise((r) => setTimeout(r, 150));
      const third = await ns.get("KEY");
      expect(third).toBe("new");
    });

    it("should keep serving stale values if refresh fails", async () => {
      vi.useRealTimers();

      const failingBackend: ConfigBackend = {
        fetch: vi
          .fn()
          .mockResolvedValueOnce(new Map([["KEY", "original"]]))
          .mockRejectedValue(new Error("Network error")),
      };

      const ns = new ConfigNamespace(failingBackend, "store", 0);

      const first = await ns.get("KEY");
      expect(first).toBe("original");

      // Trigger stale refresh (fails silently)
      await ns.get("KEY");

      // Wait for background refresh to settle
      await new Promise((r) => setTimeout(r, 50));

      const third = await ns.get("KEY");
      expect(third).toBe("original");
    });
  });
});

describe("ConfigService", () => {
  let service: ConfigService;
  let backend: ConfigBackend;

  beforeEach(() => {
    backend = createMockBackend({ API_KEY: "secret123" });
    service = new ConfigService();
  });

  describe("single namespace", () => {
    beforeEach(() => {
      service.registerNamespace("default", new ConfigNamespace(backend, "store-1", null));
    });

    it("should get a value via convenience method", async () => {
      const value = await service.get("API_KEY");
      expect(value).toBe("secret123");
    });

    it("should getOrThrow via convenience method", async () => {
      const value = await service.getOrThrow("API_KEY");
      expect(value).toBe("secret123");
    });

    it("should getAll via convenience method", async () => {
      const all = await service.getAll();
      expect(all).toEqual({ API_KEY: "secret123" });
    });

    it("should parse via convenience method", async () => {
      const schema = { parse: (data: unknown) => data as Record<string, string> };
      const parsed = await service.parse(schema);
      expect(parsed).toEqual({ API_KEY: "secret123" });
    });
  });

  describe("multiple namespaces", () => {
    beforeEach(() => {
      const backend2 = createMockBackend({ STRIPE_KEY: "sk_test_123" });
      service.registerNamespace("app", new ConfigNamespace(backend, "store-1", null));
      service.registerNamespace("payments", new ConfigNamespace(backend2, "store-2", null));
    });

    it("should access specific namespace", async () => {
      const value = await service.namespace("payments").get("STRIPE_KEY");
      expect(value).toBe("sk_test_123");
    });

    it("should throw when accessing convenience methods with multiple namespaces", async () => {
      await expect(service.get("API_KEY")).rejects.toThrow(
        "Multiple config namespaces registered",
      );
    });

    it("should throw for unknown namespace", () => {
      expect(() => service.namespace("unknown")).toThrow('Config namespace "unknown" not registered');
    });
  });

  describe("no namespaces", () => {
    it("should throw when no namespaces are registered", async () => {
      await expect(service.get("KEY")).rejects.toThrow("No config namespaces registered");
    });
  });
});
