import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConfigNamespace, SecretResolver } from "@celerity-sdk/config";
import { resolveCacheCredentials } from "../src/credentials";
import { CacheError } from "../src/errors";

const getString = vi.fn();

// The credential lives in the secret store that owns it and the resources
// namespace carries only a reference, so resolving one means a call out to that
// store. The resolver is supplied by the layer, so a stub is all it takes here.
// These tests are about which source is consulted and in what order, not about
// talking to any particular cloud.
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

describe("cache AUTH token from a secret reference", () => {
  beforeEach(() => {
    getString.mockReset();
  });

  it("fetches the token from the referenced secret", async () => {
    getString.mockResolvedValue("generated-token");
    const ns = mockNamespace({
      myCache_host: "clustercfg.example.cache.amazonaws.com",
      myCache_authTokenSecretId: "arn:aws:secretsmanager:eu-west-2:1:secret:myCache-auth",
    });

    const creds = await resolveCacheCredentials("myCache", ns, { secrets });

    expect(await creds.getPasswordAuth()).toEqual({ authToken: "generated-token" });
    expect(getString).toHaveBeenCalledWith(
      "arn:aws:secretsmanager:eu-west-2:1:secret:myCache-auth",
    );
  });

  // Local development seeds the literal, because there the token is a fixed
  // constant nobody needs to protect, and a local run never reaches for a store.
  it("prefers a literal token", async () => {
    const ns = mockNamespace({
      myCache_host: "localhost",
      myCache_authToken: "local-token",
      myCache_authTokenSecretId: "arn:aws:secretsmanager:eu-west-2:1:secret:myCache-auth",
    });

    const creds = await resolveCacheCredentials("myCache", ns, { secrets });

    expect(await creds.getPasswordAuth()).toEqual({ authToken: "local-token" });
    expect(getString).not.toHaveBeenCalled();
  });

  // A cache with no auth configured is a legitimate local setup; the client
  // connects without a password rather than failing.
  it("leaves the token unset when neither is configured", async () => {
    const ns = mockNamespace({ myCache_host: "localhost" });

    const creds = await resolveCacheCredentials("myCache", ns, { secrets });

    expect(await creds.getPasswordAuth()).toEqual({ authToken: undefined });
    expect(getString).not.toHaveBeenCalled();
  });

  // A reference with nowhere to resolve it, config published for a deployed
  // cache but the app is running somewhere with no secret store wired up. Silently
  // connecting without a password would surface much later as an auth failure.
  it("fails when a reference is present but no resolver was supplied", async () => {
    const ns = mockNamespace({
      myCache_host: "clustercfg.example.cache.amazonaws.com",
      myCache_authTokenSecretId: "arn:aws:secretsmanager:eu-west-2:1:secret:myCache-auth",
    });

    await expect(resolveCacheCredentials("myCache", ns)).rejects.toThrow(CacheError);
    await expect(resolveCacheCredentials("myCache", ns)).rejects.toThrow(
      /myCache_authTokenSecretId.*no secret store/s,
    );
  });

  // An unreadable secret is usually a missing IAM grant, and the raw store error
  // names neither the cache nor the secret.
  it("reports which cache and secret could not be read", async () => {
    getString.mockRejectedValue(new Error("AccessDeniedException"));
    const ns = mockNamespace({
      myCache_host: "clustercfg.example.cache.amazonaws.com",
      myCache_authTokenSecretId: "arn:aws:secretsmanager:eu-west-2:1:secret:myCache-auth",
    });

    await expect(resolveCacheCredentials("myCache", ns, { secrets })).rejects.toThrow(CacheError);
    await expect(resolveCacheCredentials("myCache", ns, { secrets })).rejects.toThrow(
      /myCache.*myCache-auth.*AccessDeniedException/,
    );
  });
});
