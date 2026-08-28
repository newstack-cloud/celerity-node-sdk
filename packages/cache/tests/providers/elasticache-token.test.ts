import { describe, it, expect, afterEach, vi } from "vitest";
import type { ConfigNamespace } from "@celerity-sdk/config";
import { createElastiCacheTokenProviderFactory } from "../../src/providers/redis/iam/elasticache-token";
import { CacheError } from "../../src/errors";

function mockNamespace(values: Record<string, string | undefined> = {}): ConfigNamespace {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
    getOrThrow: vi.fn(),
    getAll: vi.fn(),
    parse: vi.fn(),
  };
}

function context(values: Record<string, string | undefined> = {}) {
  return { ...contextWithoutUser(values), user: "u" };
}

function contextWithoutUser(values: Record<string, string | undefined> = {}) {
  return {
    configKey: "myCache",
    resourceConfig: mockNamespace(values),
    host: "cache.example.com",
  };
}

function regionOf(provider: unknown): string {
  return (provider as { region: string }).region;
}

describe("ElastiCache token provider", () => {
  const originalRegion = process.env.AWS_REGION;
  const originalDefault = process.env.AWS_DEFAULT_REGION;

  afterEach(() => {
    if (originalRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = originalRegion;
    if (originalDefault === undefined) delete process.env.AWS_DEFAULT_REGION;
    else process.env.AWS_DEFAULT_REGION = originalDefault;
  });

  it("takes the region from config where it names one", async () => {
    process.env.AWS_REGION = "us-east-1";
    const factory = createElastiCacheTokenProviderFactory();

    const provider = await factory(context({ myCache_region: "eu-west-2" }));

    expect(regionOf(provider)).toBe("eu-west-2");
  });

  it("falls back to the region the function is running in", async () => {
    process.env.AWS_REGION = "eu-west-2";
    const factory = createElastiCacheTokenProviderFactory();

    expect(regionOf(await factory(context()))).toBe("eu-west-2");
  });

  it("accepts the default region variable where the primary one is unset", async () => {
    delete process.env.AWS_REGION;
    process.env.AWS_DEFAULT_REGION = "ap-southeast-2";
    const factory = createElastiCacheTokenProviderFactory();

    expect(regionOf(await factory(context()))).toBe("ap-southeast-2");
  });

  // A token signed for the wrong region is rejected at connect with an error
  // that says nothing about the region, so failing here names what is missing.
  it("says what is missing when neither config nor the environment has one", async () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    const factory = createElastiCacheTokenProviderFactory();

    await expect(factory(context())).rejects.toThrow(/AWS_REGION/);
  });

  // ElastiCache signs the token for an RBAC user, so it needs one. The generic
  // resolver does not require it, because Memorystore's IAM auth has no user at
  // all. The token is the whole credential for Memorystore.
  it("names ElastiCache in error when there is no user to sign for", async () => {
    process.env.AWS_REGION = "eu-west-2";
    const factory = createElastiCacheTokenProviderFactory();

    await expect(factory(contextWithoutUser())).rejects.toThrow(CacheError);
    await expect(factory(contextWithoutUser())).rejects.toThrow(/ElastiCache.*myCache_user/s);
  });
});
