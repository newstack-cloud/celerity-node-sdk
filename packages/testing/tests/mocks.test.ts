import { describe, it, expect, vi } from "vitest";
import { createResourceMock, createMocksForTokens } from "../src/mocks";
import type { MockFnCreator } from "../src/mocks";
import type { ResourceTokenInfo } from "../src/discovery";

describe("createResourceMock", () => {
  const mockFnCreator: MockFnCreator = () => vi.fn();

  describe("datastore", () => {
    it("should create a mock with all datastore methods", () => {
      const mock = createResourceMock("datastore", mockFnCreator);
      expect(mock).not.toBeNull();
      expect(Object.keys(mock!)).toEqual([
        "getItem",
        "putItem",
        "deleteItem",
        "query",
        "scan",
        "batchGetItems",
        "batchWriteItems",
      ]);
    });

    it("should return callable mock functions", () => {
      const mock = createResourceMock("datastore", mockFnCreator)!;
      mock.getItem("key");
      expect(mock.getItem).toHaveBeenCalledWith("key");
    });
  });

  describe("topic", () => {
    it("should create a mock with publish and publishBatch", () => {
      const mock = createResourceMock("topic", mockFnCreator);
      expect(mock).not.toBeNull();
      expect(Object.keys(mock!)).toEqual(["publish", "publishBatch"]);
    });
  });

  describe("queue", () => {
    it("should create a mock with sendMessage and sendMessageBatch", () => {
      const mock = createResourceMock("queue", mockFnCreator);
      expect(mock).not.toBeNull();
      expect(Object.keys(mock!)).toEqual(["sendMessage", "sendMessageBatch"]);
    });
  });

  describe("cache", () => {
    it("should create a mock with all cache methods", () => {
      const mock = createResourceMock("cache", mockFnCreator);
      expect(mock).not.toBeNull();
      const keys = Object.keys(mock!);
      expect(keys).toContain("get");
      expect(keys).toContain("set");
      expect(keys).toContain("delete");
      expect(keys).toContain("transaction");
      expect(keys).toContain("hashGet");
      expect(keys).toContain("sortedSetAdd");
      expect(keys.length).toBe(49);
    });
  });

  describe("bucket", () => {
    it("should create a mock with all bucket methods", () => {
      const mock = createResourceMock("bucket", mockFnCreator);
      expect(mock).not.toBeNull();
      expect(Object.keys(mock!)).toEqual([
        "get",
        "put",
        "delete",
        "info",
        "exists",
        "list",
        "copy",
        "signUrl",
      ]);
    });
  });

  describe("config", () => {
    it("should create a mock with all config methods", () => {
      const mock = createResourceMock("config", mockFnCreator);
      expect(mock).not.toBeNull();
      expect(Object.keys(mock!)).toEqual(["get", "getOrThrow", "getAll", "parse"]);
    });
  });

  describe("unknown resource types", () => {
    it("should return null for sqlDatabase", () => {
      expect(createResourceMock("sqlDatabase", mockFnCreator)).toBeNull();
    });

    it("should return null for unrecognised types", () => {
      expect(createResourceMock("unknown", mockFnCreator)).toBeNull();
    });
  });

  describe("auto-detection fallback", () => {
    it("should use vitest vi.fn when no mockFn is provided", () => {
      const mock = createResourceMock("topic");
      expect(mock).not.toBeNull();
      // vi.fn is globally available in vitest — the auto-detect should find it
      mock!.publish("test");
      expect(mock!.publish).toHaveBeenCalledWith("test");
    });
  });
});

describe("createMocksForTokens", () => {
  const mockFnCreator: MockFnCreator = () => vi.fn();

  it("should create mocks for all mockable tokens", () => {
    const tokens: ResourceTokenInfo[] = [
      { token: Symbol.for("celerity:datastore:users"), type: "datastore", name: "users" },
      { token: Symbol.for("celerity:topic:events"), type: "topic", name: "events" },
    ];

    const mocks = createMocksForTokens(tokens, mockFnCreator);
    expect(mocks.size).toBe(2);
    expect(mocks.has(Symbol.for("celerity:datastore:users"))).toBe(true);
    expect(mocks.has(Symbol.for("celerity:topic:events"))).toBe(true);
  });

  it("should skip unmockable resource types", () => {
    const tokens: ResourceTokenInfo[] = [
      { token: Symbol.for("celerity:datastore:users"), type: "datastore", name: "users" },
      { token: Symbol.for("celerity:sqlDatabase:main"), type: "sqlDatabase", name: "main" },
    ];

    const mocks = createMocksForTokens(tokens, mockFnCreator);
    expect(mocks.size).toBe(1);
    expect(mocks.has(Symbol.for("celerity:datastore:users"))).toBe(true);
    expect(mocks.has(Symbol.for("celerity:sqlDatabase:main"))).toBe(false);
  });

  it("should return an empty map for empty tokens", () => {
    const mocks = createMocksForTokens([], mockFnCreator);
    expect(mocks.size).toBe(0);
  });
});
