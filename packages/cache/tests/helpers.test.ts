import { describe, it, expect, vi } from "vitest";
import type { ServiceContainer } from "@celerity-sdk/types";
import { getCache, getCacheCredentials } from "../src/helpers";
import { cacheToken, cacheCredentialsToken, DEFAULT_CACHE_TOKEN, DEFAULT_CACHE_CREDENTIALS_TOKEN } from "../src/decorators";

function mockContainer(resolveImpl: (token: unknown) => unknown): ServiceContainer {
  return {
    resolve: vi.fn().mockImplementation((token: unknown) => Promise.resolve(resolveImpl(token))),
    register: vi.fn(),
    has: vi.fn(),
    closeAll: vi.fn(),
  };
}

describe("getCache", () => {
  it("resolves the resource-specific token for a named resource", async () => {
    const fakeCache = { name: "primary" };
    const container = mockContainer((token) =>
      token === cacheToken("primaryCache") ? fakeCache : undefined,
    );

    const result = await getCache(container, "primaryCache");

    expect(result).toBe(fakeCache);
    expect(container.resolve).toHaveBeenCalledWith(cacheToken("primaryCache"));
  });

  it("resolves the default token when no resource name is given", async () => {
    const fakeCache = { name: "default" };
    const container = mockContainer((token) =>
      token === DEFAULT_CACHE_TOKEN ? fakeCache : undefined,
    );

    const result = await getCache(container);

    expect(result).toBe(fakeCache);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_CACHE_TOKEN);
  });
});

describe("getCacheCredentials", () => {
  it("resolves the resource-specific credentials token", async () => {
    const fakeCreds = { name: "creds" };
    const container = mockContainer((token) =>
      token === cacheCredentialsToken("primaryCache") ? fakeCreds : undefined,
    );

    const result = await getCacheCredentials(container, "primaryCache");

    expect(result).toBe(fakeCreds);
    expect(container.resolve).toHaveBeenCalledWith(cacheCredentialsToken("primaryCache"));
  });

  it("resolves the default credentials token when no name is given", async () => {
    const fakeCreds = { name: "default-creds" };
    const container = mockContainer((token) =>
      token === DEFAULT_CACHE_CREDENTIALS_TOKEN ? fakeCreds : undefined,
    );

    const result = await getCacheCredentials(container);

    expect(result).toBe(fakeCreds);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_CACHE_CREDENTIALS_TOKEN);
  });
});
