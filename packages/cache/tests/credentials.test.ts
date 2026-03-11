import { describe, it, expect, vi } from "vitest";
import type { ConfigNamespace } from "@celerity-sdk/config";
import { resolveCacheCredentials } from "../src/credentials";
import { CacheError } from "../src/errors";
import type { TokenProviderFactory } from "../src/types";

function mockNamespace(values: Record<string, string | undefined>): ConfigNamespace {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
    getOrThrow: vi.fn(),
    getAll: vi.fn(),
    parse: vi.fn(),
  };
}

describe("resolveCacheCredentials", () => {
  describe("password mode", () => {
    it("resolves credentials with host and defaults", async () => {
      const ns = mockNamespace({ myCache_host: "redis.example.com" });
      const creds = await resolveCacheCredentials("myCache", ns);

      const info = await creds.getConnectionInfo();
      expect(info.host).toBe("redis.example.com");
      expect(info.port).toBe(6379);
      expect(info.authMode).toBe("password");
      expect(info.tls).toBe(true);
      expect(info.clusterMode).toBe(false);
      expect(info.keyPrefix).toBe("");
    });

    it("resolves custom port and key prefix", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_port: "6380",
        myCache_keyPrefix: "app:",
      });
      const creds = await resolveCacheCredentials("myCache", ns);

      const info = await creds.getConnectionInfo();
      expect(info.port).toBe(6380);
      expect(info.keyPrefix).toBe("app:");
    });

    it("resolves cluster mode", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_clusterMode: "true",
      });
      const creds = await resolveCacheCredentials("myCache", ns);

      const info = await creds.getConnectionInfo();
      expect(info.clusterMode).toBe(true);
    });

    it("resolves tls=false", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_tls: "false",
      });
      const creds = await resolveCacheCredentials("myCache", ns);

      const info = await creds.getConnectionInfo();
      expect(info.tls).toBe(false);
    });

    it("returns auth token via getPasswordAuth", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authToken: "secret-token",
      });
      const creds = await resolveCacheCredentials("myCache", ns);

      const auth = await creds.getPasswordAuth();
      expect(auth.authToken).toBe("secret-token");
    });

    it("returns undefined auth token when not configured", async () => {
      const ns = mockNamespace({ myCache_host: "redis.example.com" });
      const creds = await resolveCacheCredentials("myCache", ns);

      const auth = await creds.getPasswordAuth();
      expect(auth.authToken).toBeUndefined();
    });

    it("throws CacheError from getIamAuth in password mode", async () => {
      const ns = mockNamespace({ myCache_host: "redis.example.com" });
      const creds = await resolveCacheCredentials("myCache", ns);

      await expect(creds.getIamAuth()).rejects.toThrow(CacheError);
    });
  });

  describe("IAM mode", () => {
    const mockTokenProvider = { getToken: vi.fn().mockResolvedValue("iam-token-123") };
    const mockFactory: TokenProviderFactory = vi.fn(() => mockTokenProvider);

    it("resolves IAM credentials with all required fields", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
        myCache_region: "us-east-1",
      });
      const creds = await resolveCacheCredentials("myCache", ns, mockFactory);

      const info = await creds.getConnectionInfo();
      expect(info.authMode).toBe("iam");
      expect(info.tls).toBe(true); // forced for IAM
      expect(info.user).toBe("cache-user");
    });

    it("returns IAM token via getIamAuth", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
        myCache_region: "us-east-1",
      });
      const creds = await resolveCacheCredentials("myCache", ns, mockFactory);

      const auth = await creds.getIamAuth();
      expect(auth.token).toBe("iam-token-123");
    });

    it("throws CacheError from getPasswordAuth in IAM mode", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
        myCache_region: "us-east-1",
      });
      const creds = await resolveCacheCredentials("myCache", ns, mockFactory);

      await expect(creds.getPasswordAuth()).rejects.toThrow(CacheError);
    });

    it("forces TLS on even when tls is explicitly false", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
        myCache_region: "us-east-1",
        myCache_tls: "false",
      });
      const creds = await resolveCacheCredentials("myCache", ns, mockFactory);

      const info = await creds.getConnectionInfo();
      expect(info.tls).toBe(true);
    });
  });

  describe("validation errors", () => {
    it("throws when host is missing", async () => {
      const ns = mockNamespace({});
      await expect(resolveCacheCredentials("myCache", ns)).rejects.toThrow(CacheError);
      await expect(resolveCacheCredentials("myCache", ns)).rejects.toThrow("myCache_host");
    });

    it("throws when IAM mode is missing user", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_region: "us-east-1",
      });
      const factory: TokenProviderFactory = vi.fn();

      await expect(resolveCacheCredentials("myCache", ns, factory)).rejects.toThrow(
        "myCache_user",
      );
    });

    it("throws when IAM mode is missing tokenProviderFactory", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
        myCache_region: "us-east-1",
      });

      await expect(resolveCacheCredentials("myCache", ns)).rejects.toThrow("tokenProviderFactory");
    });

    it("throws when IAM mode is missing region", async () => {
      const ns = mockNamespace({
        myCache_host: "redis.example.com",
        myCache_authMode: "iam",
        myCache_user: "cache-user",
      });
      const factory: TokenProviderFactory = vi.fn();

      await expect(resolveCacheCredentials("myCache", ns, factory)).rejects.toThrow(
        "myCache_region",
      );
    });
  });
});
