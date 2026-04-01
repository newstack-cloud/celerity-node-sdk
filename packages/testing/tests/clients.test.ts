import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResourceTokenInfo } from "../src/discovery";
import type { BlueprintResource } from "../src/blueprint";
import { createRealClients } from "../src/clients";

// Mock all SDK package imports
vi.mock("@celerity-sdk/datastore", () => ({
  createDatastoreClient: vi.fn(),
}));
vi.mock("@celerity-sdk/topic", () => ({
  createTopicClient: vi.fn(),
}));
vi.mock("@celerity-sdk/queue", () => ({
  createQueueClient: vi.fn(),
}));
vi.mock("@celerity-sdk/cache", () => ({
  createCacheClient: vi.fn(),
}));
vi.mock("@celerity-sdk/bucket", () => ({
  createObjectStorage: vi.fn(),
}));
vi.mock("@celerity-sdk/sql-database", () => ({
  createKnexInstance: vi.fn(),
}));
vi.mock("@celerity-sdk/config", () => ({
  ConfigNamespaceImpl: vi.fn().mockImplementation((_backend: unknown, storeId: string) => ({
    __storeId: storeId,
  })),
  LocalConfigBackend: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

function makeToken(type: string, name: string): ResourceTokenInfo {
  return {
    token: Symbol.for(`celerity:${type}:${name}`),
    type,
    name,
  };
}

function makeBlueprintResources(
  entries: Array<[string, Partial<BlueprintResource>]>,
): Map<string, BlueprintResource> {
  const map = new Map<string, BlueprintResource>();
  for (const [id, partial] of entries) {
    map.set(id, {
      resourceId: id,
      type: partial.type ?? "",
      physicalName: partial.physicalName ?? id,
    });
  }
  return map;
}

describe("createRealClients", () => {
  describe("datastore", () => {
    it("should create a datastore client and register handles", async () => {
      const { createDatastoreClient } = await import("@celerity-sdk/datastore");
      const mockDatastore = { getItem: vi.fn() };
      const mockClient = {
        datastore: vi.fn().mockReturnValue(mockDatastore),
        close: vi.fn(),
      };
      vi.mocked(createDatastoreClient).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("datastore", "users")];
      const bp = makeBlueprintResources([["users", { physicalName: "users-table" }]]);

      const { handles, closeables } = await createRealClients(tokens, bp);

      expect(createDatastoreClient).toHaveBeenCalledWith({ provider: "local" });
      expect(mockClient.datastore).toHaveBeenCalledWith("users-table");
      expect(handles.get(tokens[0].token)).toBe(mockDatastore);
      expect(closeables).toHaveLength(1);
    });

    it("should use resourceId as fallback when blueprint has no entry", async () => {
      const { createDatastoreClient } = await import("@celerity-sdk/datastore");
      const mockDatastore = {};
      const mockClient = {
        datastore: vi.fn().mockReturnValue(mockDatastore),
        close: vi.fn(),
      };
      vi.mocked(createDatastoreClient).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("datastore", "orders")];
      const bp = new Map<string, BlueprintResource>();

      await createRealClients(tokens, bp);

      expect(mockClient.datastore).toHaveBeenCalledWith("orders");
    });
  });

  describe("topic", () => {
    it("should create a topic client and register handles", async () => {
      const { createTopicClient } = await import("@celerity-sdk/topic");
      const mockTopic = { publish: vi.fn() };
      const mockClient = {
        topic: vi.fn().mockReturnValue(mockTopic),
        close: vi.fn(),
      };
      vi.mocked(createTopicClient).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("topic", "events")];
      const bp = makeBlueprintResources([["events", { physicalName: "event-topic" }]]);

      const { handles } = await createRealClients(tokens, bp);

      expect(mockClient.topic).toHaveBeenCalledWith("event-topic");
      expect(handles.get(tokens[0].token)).toBe(mockTopic);
    });
  });

  describe("queue", () => {
    it("should create a queue client and register handles", async () => {
      const { createQueueClient } = await import("@celerity-sdk/queue");
      const mockQueue = { sendMessage: vi.fn() };
      const mockClient = {
        queue: vi.fn().mockReturnValue(mockQueue),
        close: vi.fn(),
      };
      vi.mocked(createQueueClient).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("queue", "jobs")];
      const bp = makeBlueprintResources([["jobs", { physicalName: "job-queue" }]]);

      const { handles } = await createRealClients(tokens, bp);

      expect(mockClient.queue).toHaveBeenCalledWith("job-queue");
      expect(handles.get(tokens[0].token)).toBe(mockQueue);
    });
  });

  describe("cache", () => {
    it("should create a cache client using default endpoint", async () => {
      const { createCacheClient } = await import("@celerity-sdk/cache");
      const mockCache = { get: vi.fn() };
      const mockClient = {
        cache: vi.fn().mockReturnValue(mockCache),
        close: vi.fn(),
      };
      vi.mocked(createCacheClient).mockResolvedValue(mockClient as never);

      const original = process.env.CELERITY_REDIS_ENDPOINT;
      delete process.env.CELERITY_REDIS_ENDPOINT;
      try {
        const tokens = [makeToken("cache", "session")];
        const bp = new Map<string, BlueprintResource>();

        const { handles } = await createRealClients(tokens, bp);

        expect(createCacheClient).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              host: "localhost",
              port: 6379,
            }),
          }),
        );
        expect(mockClient.cache).toHaveBeenCalledWith("session");
        expect(handles.get(tokens[0].token)).toBe(mockCache);
      } finally {
        if (original !== undefined) {
          process.env.CELERITY_REDIS_ENDPOINT = original;
        }
      }
    });

    it("should parse CELERITY_REDIS_ENDPOINT env var", async () => {
      const { createCacheClient } = await import("@celerity-sdk/cache");
      const mockClient = {
        cache: vi.fn().mockReturnValue({}),
        close: vi.fn(),
      };
      vi.mocked(createCacheClient).mockResolvedValue(mockClient as never);

      process.env.CELERITY_REDIS_ENDPOINT = "redis://myhost:7777";
      try {
        const tokens = [makeToken("cache", "c1")];
        await createRealClients(tokens, new Map());

        expect(createCacheClient).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              host: "myhost",
              port: 7777,
            }),
          }),
        );
      } finally {
        delete process.env.CELERITY_REDIS_ENDPOINT;
      }
    });
  });

  describe("bucket", () => {
    it("should create a bucket client and register handles", async () => {
      const { createObjectStorage } = await import("@celerity-sdk/bucket");
      const mockBucket = { get: vi.fn() };
      const mockClient = {
        bucket: vi.fn().mockReturnValue(mockBucket),
        close: vi.fn(),
      };
      vi.mocked(createObjectStorage).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("bucket", "uploads")];
      const bp = makeBlueprintResources([["uploads", { physicalName: "upload-bucket" }]]);

      const { handles } = await createRealClients(tokens, bp);

      expect(mockClient.bucket).toHaveBeenCalledWith("upload-bucket");
      expect(handles.get(tokens[0].token)).toBe(mockBucket);
    });
  });

  describe("sqlDatabase", () => {
    it("should create knex instances and register handles", async () => {
      const { createKnexInstance } = await import("@celerity-sdk/sql-database");
      const mockKnex = { destroy: vi.fn(), raw: vi.fn() };
      vi.mocked(createKnexInstance).mockResolvedValue(mockKnex as never);

      const original = process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT;
      process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT =
        "postgres://celerity:celerity@localhost:5432/celerity";
      try {
        const tokens = [makeToken("sqlDatabase", "mainDb")];
        const bp = new Map<string, BlueprintResource>();

        const { handles, closeables } = await createRealClients(tokens, bp);

        expect(createKnexInstance).toHaveBeenCalledWith(
          expect.objectContaining({
            deployTarget: "functions",
          }),
        );
        expect(handles.get(tokens[0].token)).toBe(mockKnex);
        expect(closeables).toHaveLength(1);

        // Closing should call knex.destroy()
        await closeables[0].close?.();
        expect(mockKnex.destroy).toHaveBeenCalled();
      } finally {
        if (original !== undefined) {
          process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT = original;
        } else {
          delete process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT;
        }
      }
    });

    it("should throw when CELERITY_LOCAL_SQL_DATABASE_ENDPOINT is not set", async () => {
      const original = process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT;
      delete process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT;
      try {
        const tokens = [makeToken("sqlDatabase", "mainDb")];
        await expect(createRealClients(tokens, new Map())).rejects.toThrow(
          "CELERITY_LOCAL_SQL_DATABASE_ENDPOINT must be set",
        );
      } finally {
        if (original !== undefined) {
          process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT = original;
        }
      }
    });
  });

  describe("grouping", () => {
    it("should share a single client across multiple tokens of the same type", async () => {
      const { createDatastoreClient } = await import("@celerity-sdk/datastore");
      const mockClient = {
        datastore: vi.fn().mockReturnValue({}),
        close: vi.fn(),
      };
      vi.mocked(createDatastoreClient).mockResolvedValue(mockClient as never);

      const tokens = [makeToken("datastore", "users"), makeToken("datastore", "orders")];
      const bp = new Map<string, BlueprintResource>();

      await createRealClients(tokens, bp);

      // Only one client created despite two tokens
      expect(createDatastoreClient).toHaveBeenCalledTimes(1);
      expect(mockClient.datastore).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should wrap errors with a helpful message", async () => {
      const { createDatastoreClient } = await import("@celerity-sdk/datastore");
      vi.mocked(createDatastoreClient).mockRejectedValue(new Error("connection refused"));

      const tokens = [makeToken("datastore", "users")];

      await expect(createRealClients(tokens, new Map())).rejects.toThrow(
        /Failed to create datastore client.*@celerity-sdk\/datastore.*connection refused/,
      );
    });

    it("should mention sql-database package name for sqlDatabase type", async () => {
      const { createKnexInstance } = await import("@celerity-sdk/sql-database");
      vi.mocked(createKnexInstance).mockRejectedValue(new Error("no driver"));

      const tokens = [makeToken("sqlDatabase", "db")];

      await expect(createRealClients(tokens, new Map())).rejects.toThrow(
        "@celerity-sdk/sql-database",
      );
    });
  });

  describe("config tokens", () => {
    it("should create config namespace handles", async () => {
      const tokens = [makeToken("config", "appConfig")];
      const { handles, closeables } = await createRealClients(tokens, new Map());
      expect(handles.size).toBe(1);
      expect(handles.get(tokens[0].token)).toBeDefined();
      expect(closeables).toHaveLength(0);
    });
  });

  describe("empty input", () => {
    it("should return empty handles for no tokens", async () => {
      const { handles, closeables } = await createRealClients([], new Map());
      expect(handles.size).toBe(0);
      expect(closeables).toHaveLength(0);
    });
  });
});
