import { describe, it, expect, vi } from "vitest";
import { resolveDatabaseCredentials, buildConnectionUrl } from "../src/credentials";
import { SqlDatabaseError } from "../src/errors";
import type { TokenProviderFactory } from "../src/types";
import { mockNamespace } from "./test-helpers";

function mockTokenProviderFactory(): TokenProviderFactory {
  return vi.fn((hostname: string) => ({
    getToken: vi.fn().mockResolvedValue(`iam-token-for-${hostname}`),
  }));
}

describe("buildConnectionUrl", () => {
  it("builds a postgres URL with SSL", () => {
    const url = buildConnectionUrl({
      engine: "postgres", user: "admin", password: "p@ss",
      host: "db.host.com", port: 5432, database: "mydb", ssl: true,
    });
    expect(url).toBe("postgresql://admin:p%40ss@db.host.com:5432/mydb?sslmode=require");
  });

  it("builds a postgres URL without SSL", () => {
    const url = buildConnectionUrl({
      engine: "postgres", user: "admin", password: "pass",
      host: "localhost", port: 5432, database: "mydb", ssl: false,
    });
    expect(url).toBe("postgresql://admin:pass@localhost:5432/mydb");
  });

  it("builds a mysql URL with SSL", () => {
    const url = buildConnectionUrl({
      engine: "mysql", user: "root", password: "secret",
      host: "mysql.host", port: 3306, database: "app", ssl: true,
    });
    expect(url).toBe("mysql://root:secret@mysql.host:3306/app?ssl=true");
  });

  it("encodes special characters in password", () => {
    const url = buildConnectionUrl({
      engine: "postgres", user: "user", password: "p@ss/w0rd#!",
      host: "host", port: 5432, database: "db", ssl: false,
    });
    expect(url).toContain("p%40ss%2Fw0rd%23!");
  });
});

describe("resolveDatabaseCredentials", () => {
  describe("password auth", () => {
    it("resolves credentials with all fields", async () => {
      const ns = mockNamespace({
        ordersDb_host: "orders.rds.amazonaws.com",
        ordersDb_port: "5432",
        ordersDb_database: "orders",
        ordersDb_engine: "postgres",
        ordersDb_user: "admin",
        ordersDb_password: "secret",
        ordersDb_ssl: "true",
      });

      const creds = await resolveDatabaseCredentials("ordersDb", ns);
      const info = await creds.getConnectionInfo();

      expect(info.host).toBe("orders.rds.amazonaws.com");
      expect(info.port).toBe(5432);
      expect(info.database).toBe("orders");
      expect(info.engine).toBe("postgres");
      expect(info.user).toBe("admin");
      expect(info.ssl).toBe(true);
      expect(info.authMode).toBe("password");
      expect(info.readHost).toBeUndefined();
    });

    it("uses default port for postgres when not specified", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.port).toBe(5432);
    });

    it("uses default port for mysql when engine is mysql", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
        db_engine: "mysql",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.port).toBe(3306);
    });

    it("defaults database name to configKey", async () => {
      const ns = mockNamespace({
        ordersDb_host: "host",
        ordersDb_user: "user",
        ordersDb_password: "pass",
      });

      const creds = await resolveDatabaseCredentials("ordersDb", ns);
      const info = await creds.getConnectionInfo();
      expect(info.database).toBe("ordersDb");
    });

    it("defaults engine to postgres", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.engine).toBe("postgres");
    });

    it("defaults ssl to true", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.ssl).toBe(true);
    });

    it("disables ssl when set to false", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
        db_ssl: "false",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.ssl).toBe(false);
    });

    it("includes readHost when present", async () => {
      const ns = mockNamespace({
        db_host: "primary.host",
        db_user: "user",
        db_password: "pass",
        db_readHost: "reader.host",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const info = await creds.getConnectionInfo();
      expect(info.readHost).toBe("reader.host");
    });

    it("returns password auth with URLs", async () => {
      const ns = mockNamespace({
        db_host: "primary.host",
        db_port: "5432",
        db_database: "mydb",
        db_user: "admin",
        db_password: "secret",
        db_ssl: "true",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const auth = await creds.getPasswordAuth();

      expect(auth.password).toBe("secret");
      expect(auth.url).toBe("postgresql://admin:secret@primary.host:5432/mydb?sslmode=require");
      expect(auth.readUrl).toBeUndefined();
    });

    it("includes readUrl when readHost is present", async () => {
      const ns = mockNamespace({
        db_host: "primary.host",
        db_user: "admin",
        db_password: "secret",
        db_readHost: "reader.host",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      const auth = await creds.getPasswordAuth();

      expect(auth.readUrl).toContain("reader.host");
    });

    it("throws SqlDatabaseError on getIamAuth for password credentials", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
      });

      const creds = await resolveDatabaseCredentials("db", ns);
      await expect(creds.getIamAuth()).rejects.toThrow(SqlDatabaseError);
      await expect(creds.getIamAuth()).rejects.toThrow('authMode is "password"');
    });

    it("does not require tokenProviderFactory for password auth", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "user",
        db_password: "pass",
      });

      // No factory passed — should work fine for password auth
      const creds = await resolveDatabaseCredentials("db", ns);
      expect(await creds.getConnectionInfo()).toMatchObject({ authMode: "password" });
    });
  });

  describe("IAM auth", () => {
    it("resolves IAM credentials (forces ssl)", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "iam_user",
        db_authMode: "iam",
        db_ssl: "false", // should be forced to true
      });

      const creds = await resolveDatabaseCredentials("db", ns, mockTokenProviderFactory());
      const info = await creds.getConnectionInfo();
      expect(info.authMode).toBe("iam");
      expect(info.ssl).toBe(true);
    });

    it("does not require password for IAM auth", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "iam_user",
        db_authMode: "iam",
      });

      const creds = await resolveDatabaseCredentials("db", ns, mockTokenProviderFactory());
      const info = await creds.getConnectionInfo();
      expect(info.authMode).toBe("iam");
    });

    it("throws SqlDatabaseError on getPasswordAuth for IAM credentials", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "iam_user",
        db_authMode: "iam",
      });

      const creds = await resolveDatabaseCredentials("db", ns, mockTokenProviderFactory());
      await expect(creds.getPasswordAuth()).rejects.toThrow(SqlDatabaseError);
      await expect(creds.getPasswordAuth()).rejects.toThrow('authMode is "iam"');
    });

    it("throws when tokenProviderFactory is not provided for IAM auth", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "iam_user",
        db_authMode: "iam",
      });

      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow(SqlDatabaseError);
      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow(
        "tokenProviderFactory",
      );
    });

    it("returns IAM auth with token and URLs", async () => {
      const ns = mockNamespace({
        db_host: "primary.rds.amazonaws.com",
        db_port: "5432",
        db_database: "mydb",
        db_user: "iam_user",
        db_authMode: "iam",
      });

      const creds = await resolveDatabaseCredentials("db", ns, mockTokenProviderFactory());
      const auth = await creds.getIamAuth();

      expect(auth.token).toBe("iam-token-for-primary.rds.amazonaws.com");
      expect(auth.url).toContain("primary.rds.amazonaws.com:5432/mydb");
      expect(auth.readUrl).toBeUndefined();
    });

    it("returns separate tokens for primary and read hosts", async () => {
      const ns = mockNamespace({
        db_host: "primary.rds.amazonaws.com",
        db_user: "iam_user",
        db_authMode: "iam",
        db_readHost: "reader.rds.amazonaws.com",
      });

      const factory = mockTokenProviderFactory();
      const creds = await resolveDatabaseCredentials("db", ns, factory);
      const auth = await creds.getIamAuth();

      expect(auth.token).toBe("iam-token-for-primary.rds.amazonaws.com");
      expect(auth.readUrl).toContain("reader.rds.amazonaws.com");
      expect(factory).toHaveBeenCalledTimes(2);
      expect(factory).toHaveBeenCalledWith("primary.rds.amazonaws.com", 5432, "iam_user");
      expect(factory).toHaveBeenCalledWith("reader.rds.amazonaws.com", 5432, "iam_user");
    });

    it("caches token providers across getIamAuth calls", async () => {
      const ns = mockNamespace({
        db_host: "host",
        db_user: "iam_user",
        db_authMode: "iam",
      });

      const factory = mockTokenProviderFactory();
      const creds = await resolveDatabaseCredentials("db", ns, factory);
      await creds.getIamAuth();
      await creds.getIamAuth();

      // Factory should only be called once (provider is cached)
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe("validation errors", () => {
    it("throws when host is missing", async () => {
      const ns = mockNamespace({ db_user: "user", db_password: "pass" });

      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow(SqlDatabaseError);
      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow("db_host");
    });

    it("throws when user is missing", async () => {
      const ns = mockNamespace({ db_host: "host", db_password: "pass" });

      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow(SqlDatabaseError);
      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow("db_user");
    });

    it("throws when password is missing for password auth", async () => {
      const ns = mockNamespace({ db_host: "host", db_user: "user" });

      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow(SqlDatabaseError);
      await expect(resolveDatabaseCredentials("db", ns)).rejects.toThrow("db_password");
    });
  });
});
