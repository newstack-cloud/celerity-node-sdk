import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Bucket, bucketToken, DEFAULT_BUCKET_TOKEN } from "../src/decorators";

const INJECT_KEY = Symbol.for("celerity:inject");
const USE_RESOURCE_KEY = Symbol.for("celerity:useResource");

describe("@Bucket() decorator", () => {
  it("writes the resource-specific inject token for a named resource", () => {
    class TestHandler {
      constructor(@Bucket("imagesBucket") _images: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(bucketToken("imagesBucket"));
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@Bucket("imagesBucket") _images: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["imagesBucket"]);
  });

  it("writes DEFAULT_BUCKET_TOKEN when no resource name is given", () => {
    class TestHandler {
      constructor(@Bucket() _bucket: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_BUCKET_TOKEN);
  });

  it("does not write USE_RESOURCE metadata for unnamed buckets", () => {
    class TestHandler {
      constructor(@Bucket() _bucket: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toBeUndefined();
  });

  it("accumulates inject tokens across multiple parameters", () => {
    class TestHandler {
      constructor(
        @Bucket("imagesBucket") _images: unknown,
        @Bucket("archiveBucket") _archive: unknown,
      ) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(bucketToken("imagesBucket"));
    expect(injectMap.get(1)).toBe(bucketToken("archiveBucket"));
  });

  it("accumulates USE_RESOURCE metadata across multiple named parameters", () => {
    class TestHandler {
      constructor(
        @Bucket("imagesBucket") _images: unknown,
        @Bucket("archiveBucket") _archive: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toContain("imagesBucket");
    expect(resources).toContain("archiveBucket");
    expect(resources).toHaveLength(2);
  });

  it("does not duplicate USE_RESOURCE entries for the same resource name", () => {
    class TestHandler {
      constructor(
        @Bucket("imagesBucket") _a: unknown,
        @Bucket("imagesBucket") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["imagesBucket"]);
  });
});

describe("bucketToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = bucketToken("imagesBucket");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:bucket:imagesBucket"));
  });

  it("returns the same symbol for the same resource name", () => {
    expect(bucketToken("images")).toBe(bucketToken("images"));
  });

  it("returns different symbols for different resource names", () => {
    expect(bucketToken("images")).not.toBe(bucketToken("archive"));
  });
});

describe("DEFAULT_BUCKET_TOKEN", () => {
  it("is a well-known symbol", () => {
    expect(DEFAULT_BUCKET_TOKEN).toBe(Symbol.for("celerity:bucket:default"));
  });
});
