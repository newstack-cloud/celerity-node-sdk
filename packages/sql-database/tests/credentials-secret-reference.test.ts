import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConfigNamespace, SecretResolver } from "@celerity-sdk/config";
import { resolveDatabaseCredentials } from "../src/credentials";
import { SqlDatabaseError } from "../src/errors";

const getString = vi.fn();

const secrets: SecretResolver = {
  getString: (ref: string) => getString(ref),
  getFields: vi.fn(),
};

function mockNamespace(values: Record<string, string | undefined>): ConfigNamespace {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
    getOrThrow: vi.fn(),
    getAll: vi.fn(),
    parse: vi.fn(),
  };
}

const base = {
  ordersDb_host: "orders.proxy-abc.eu-west-2.rds.amazonaws.com",
  ordersDb_user: "celerity_app",
  ordersDb_database: "orders",
  ordersDb_engine: "postgres",
};

const SECRET_ID = "arn:aws:secretsmanager:eu-west-2:1:secret:orders-app-user";

describe("SQL credentials from a secret reference", () => {
  beforeEach(() => {
    getString.mockReset();
  });

  it("takes the password from the referenced secret", async () => {
    getString.mockResolvedValue(JSON.stringify({ username: "celerity_app", password: "generated" }));
    const ns = mockNamespace({ ...base, ordersDb_credentialsSecretId: SECRET_ID });

    const creds = await resolveDatabaseCredentials("ordersDb", ns, { secrets });

    expect((await creds.getPasswordAuth()).password).toBe("generated");
    expect(getString).toHaveBeenCalledWith(SECRET_ID);
  });

  // Local development seeds the literal, so a local run never reaches for a
  // secret store.
  it("prefers a literal password", async () => {
    const ns = mockNamespace({ ...base, ordersDb_password: "celerity" });

    const creds = await resolveDatabaseCredentials("ordersDb", ns, { secrets });

    expect((await creds.getPasswordAuth()).password).toBe("celerity");
    expect(getString).not.toHaveBeenCalled();
  });

  // Unlike the cache, where no password is a legitimate local setup, a database
  // in password mode with no credential anywhere is a misconfiguration.
  it("fails clearly when neither is present", async () => {
    const ns = mockNamespace(base);

    await expect(resolveDatabaseCredentials("ordersDb", ns, { secrets })).rejects.toThrow(
      /_password.*_credentialsSecretId/,
    );
  });

  it("fails when a reference is present but no resolver was supplied", async () => {
    const ns = mockNamespace({ ...base, ordersDb_credentialsSecretId: SECRET_ID });

    await expect(resolveDatabaseCredentials("ordersDb", ns)).rejects.toThrow(SqlDatabaseError);
    await expect(resolveDatabaseCredentials("ordersDb", ns)).rejects.toThrow(
      /ordersDb_credentialsSecretId.*no secret store/s,
    );
  });

  it("reports which database and secret could not be read", async () => {
    getString.mockRejectedValue(new Error("AccessDeniedException"));
    const ns = mockNamespace({ ...base, ordersDb_credentialsSecretId: SECRET_ID });

    await expect(resolveDatabaseCredentials("ordersDb", ns, { secrets })).rejects.toThrow(
      SqlDatabaseError,
    );
    await expect(resolveDatabaseCredentials("ordersDb", ns, { secrets })).rejects.toThrow(
      /ordersDb.*orders-app-user.*AccessDeniedException/,
    );
  });

  it("fails when the secret has no password field", async () => {
    getString.mockResolvedValue(JSON.stringify({ username: "celerity_app" }));
    const ns = mockNamespace({ ...base, ordersDb_credentialsSecretId: SECRET_ID });

    await expect(resolveDatabaseCredentials("ordersDb", ns, { secrets })).rejects.toThrow(
      /is an object with no password field/,
    );
  });

  // The shape is the platform's, not this package's. AWS deploys wrap the
  // password in an object to match an AWS-managed RDS secret and its rotation
  // tooling; a store that holds the password as a plain string needs no wrapper
  // to be read here.
  it("takes a secret that is the password itself", async () => {
    getString.mockResolvedValue("generated");
    const ns = mockNamespace({ ...base, ordersDb_credentialsSecretId: SECRET_ID });

    const creds = await resolveDatabaseCredentials("ordersDb", ns, { secrets });

    expect((await creds.getPasswordAuth()).password).toBe("generated");
  });
});
