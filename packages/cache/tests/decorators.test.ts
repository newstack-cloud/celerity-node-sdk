import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  Cache,
  CacheCredentials,
  cacheToken,
  cacheCredentialsToken,
  cacheClientToken,
  DEFAULT_CACHE_TOKEN,
  DEFAULT_CACHE_CREDENTIALS_TOKEN,
} from "../src/decorators";

const INJECT_KEY = Symbol.for("celerity:inject");
const USE_RESOURCE_KEY = Symbol.for("celerity:useResource");

describe("@Cache() decorator", () => {
  it("writes the resource-specific inject token for a named resource", () => {
    class TestHandler {
      constructor(@Cache("primaryCache") _cache: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(cacheToken("primaryCache"));
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@Cache("primaryCache") _cache: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["primaryCache"]);
  });

  it("writes DEFAULT_CACHE_TOKEN when no resource name is given", () => {
    class TestHandler {
      constructor(@Cache() _cache: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_CACHE_TOKEN);
  });

  it("does not write USE_RESOURCE metadata for unnamed caches", () => {
    class TestHandler {
      constructor(@Cache() _cache: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toBeUndefined();
  });

  it("accumulates inject tokens across multiple parameters", () => {
    class TestHandler {
      constructor(
        @Cache("primaryCache") _primary: unknown,
        @Cache("secondaryCache") _secondary: unknown,
      ) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(cacheToken("primaryCache"));
    expect(injectMap.get(1)).toBe(cacheToken("secondaryCache"));
  });

  it("accumulates USE_RESOURCE metadata across multiple named parameters", () => {
    class TestHandler {
      constructor(
        @Cache("primaryCache") _primary: unknown,
        @Cache("secondaryCache") _secondary: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toContain("primaryCache");
    expect(resources).toContain("secondaryCache");
    expect(resources).toHaveLength(2);
  });

  it("does not duplicate USE_RESOURCE entries for the same resource name", () => {
    class TestHandler {
      constructor(
        @Cache("primaryCache") _a: unknown,
        @Cache("primaryCache") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["primaryCache"]);
  });
});

describe("@CacheCredentials() decorator", () => {
  it("writes the resource-specific credentials inject token", () => {
    class TestHandler {
      constructor(@CacheCredentials("primaryCache") _creds: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(cacheCredentialsToken("primaryCache"));
  });

  it("writes DEFAULT_CACHE_CREDENTIALS_TOKEN when no name is given", () => {
    class TestHandler {
      constructor(@CacheCredentials() _creds: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_CACHE_CREDENTIALS_TOKEN);
  });
});

describe("cacheToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = cacheToken("primaryCache");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:cache:primaryCache"));
  });

  it("returns the same symbol for the same resource name", () => {
    expect(cacheToken("primary")).toBe(cacheToken("primary"));
  });

  it("returns different symbols for different resource names", () => {
    expect(cacheToken("primary")).not.toBe(cacheToken("secondary"));
  });
});

describe("cacheCredentialsToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = cacheCredentialsToken("primaryCache");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:cache:credentials:primaryCache"));
  });
});

describe("cacheClientToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = cacheClientToken("primaryCache");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:cache:client:primaryCache"));
  });
});

describe("DEFAULT_CACHE_TOKEN", () => {
  it("is a well-known symbol", () => {
    expect(DEFAULT_CACHE_TOKEN).toBe(Symbol.for("celerity:cache:default"));
  });
});

describe("DEFAULT_CACHE_CREDENTIALS_TOKEN", () => {
  it("is a well-known symbol", () => {
    expect(DEFAULT_CACHE_CREDENTIALS_TOKEN).toBe(
      Symbol.for("celerity:cache:credentials:default"),
    );
  });
});
