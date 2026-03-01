import { describe, it, expect, afterAll } from "vitest";
import { DynamoDBDatastoreClient } from "../../src/providers/dynamodb/dynamodb-datastore-client";
import { ConditionalCheckFailedError } from "../../src/errors";

type TestItem = {
  pk: string;
  sk: string;
  total?: number;
  status?: string;
  gsiPk?: string;
  name?: string;
};

const client = new DynamoDBDatastoreClient({
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const ds = client.datastore("test-table");

afterAll(() => {
  client.close();
});

describe("DynamoDB Provider (integration)", () => {
  describe("getItem", () => {
    it("should retrieve an existing item with correct data", async () => {
      const result = await ds.getItem<TestItem>({ pk: "user-1", sk: "order-000" });

      expect(result).not.toBeNull();
      expect(result!.pk).toBe("user-1");
      expect(result!.sk).toBe("order-000");
      expect(result!.total).toBe(10);
      expect(result!.status).toBe("active");
    });

    it("should return null for a non-existent key", async () => {
      const result = await ds.getItem({ pk: "non-existent", sk: "none" });

      expect(result).toBeNull();
    });

    it("should support consistent read", async () => {
      const result = await ds.getItem<TestItem>(
        { pk: "user-1", sk: "order-000" },
        { consistentRead: true },
      );

      expect(result).not.toBeNull();
      expect(result!.pk).toBe("user-1");
    });
  });

  describe("putItem", () => {
    it("should store an item and read it back", async () => {
      await ds.putItem({
        pk: "put-test",
        sk: "item-1",
        name: "Alice",
        total: 42,
      });

      const result = await ds.getItem<TestItem>({ pk: "put-test", sk: "item-1" });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Alice");
      expect(result!.total).toBe(42);
    });

    it("should overwrite an existing item (upsert)", async () => {
      await ds.putItem({ pk: "put-test", sk: "upsert", name: "v1" });
      await ds.putItem({ pk: "put-test", sk: "upsert", name: "v2" });

      const result = await ds.getItem<TestItem>({ pk: "put-test", sk: "upsert" });
      expect(result!.name).toBe("v2");
    });

    it("should support condition expression (eq for optimistic concurrency)", async () => {
      await ds.putItem({ pk: "put-test", sk: "conditional-new", status: "draft" });

      // Condition succeeds: status matches
      await ds.putItem(
        { pk: "put-test", sk: "conditional-new", status: "published" },
        { condition: { name: "status", operator: "eq", value: "draft" } },
      );

      const result = await ds.getItem<TestItem>({ pk: "put-test", sk: "conditional-new" });
      expect(result!.status).toBe("published");
    });

    it("should throw ConditionalCheckFailedError when condition fails", async () => {
      await ds.putItem({ pk: "put-test", sk: "conditional-exists", status: "active" });

      await expect(
        ds.putItem(
          { pk: "put-test", sk: "conditional-exists", status: "updated" },
          { condition: { name: "status", operator: "eq", value: "draft" } },
        ),
      ).rejects.toThrow(ConditionalCheckFailedError);
    });
  });

  describe("deleteItem", () => {
    it("should delete an existing item", async () => {
      await ds.putItem({ pk: "del-test", sk: "to-delete" });
      expect(await ds.getItem({ pk: "del-test", sk: "to-delete" })).not.toBeNull();

      await ds.deleteItem({ pk: "del-test", sk: "to-delete" });
      expect(await ds.getItem({ pk: "del-test", sk: "to-delete" })).toBeNull();
    });

    it("should not throw when deleting a non-existent key", async () => {
      await expect(
        ds.deleteItem({ pk: "never-existed", sk: "nope" }),
      ).resolves.toBeUndefined();
    });

    it("should support condition expression", async () => {
      await ds.putItem({ pk: "del-test", sk: "cond-delete", status: "archived" });

      await ds.deleteItem(
        { pk: "del-test", sk: "cond-delete" },
        { condition: { name: "status", operator: "eq", value: "archived" } },
      );

      expect(await ds.getItem({ pk: "del-test", sk: "cond-delete" })).toBeNull();
    });
  });

  describe("query", () => {
    it("should query by key only", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(20);
      expect(items[0].pk).toBe("user-1");
    });

    it("should query with range startsWith condition", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        range: { name: "sk", operator: "startsWith", value: "order-00" },
      })) {
        items.push(item);
      }

      // order-000 through order-009
      expect(items).toHaveLength(10);
    });

    it("should query with range between condition", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        range: { name: "sk", operator: "between", low: "order-005", high: "order-009" },
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(5);
      expect(items[0].sk).toBe("order-005");
      expect(items[4].sk).toBe("order-009");
    });

    it("should support filter expression", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        filter: { name: "status", operator: "eq", value: "active" },
      })) {
        items.push(item);
      }

      // Even indices (0, 2, 4, ..., 18) = 10 items
      expect(items).toHaveLength(10);
      expect(items.every((i) => i.status === "active")).toBe(true);
    });

    it("should support descending order", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        sortAscending: false,
      })) {
        items.push(item);
      }

      expect(items[0].sk).toBe("order-019");
      expect(items[19].sk).toBe("order-000");
    });

    it("should paginate with small maxResults and still yield all items", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        maxResults: 3,
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(20);
    });

    it("should support cursor-based resume", async () => {
      const listing = ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        maxResults: 5,
      });

      const firstBatch: TestItem[] = [];
      let count = 0;
      for await (const item of listing) {
        firstBatch.push(item);
        count++;
        if (count === 7) break;
      }
      expect(firstBatch).toHaveLength(7);
      expect(listing.cursor).toBeDefined();

      // Resume from cursor
      const remaining: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        cursor: listing.cursor,
      })) {
        remaining.push(item);
      }

      // DynamoDB cursor is page-level, so some overlap may occur,
      // but total unique items should be 20
      const allKeys = new Set([
        ...firstBatch.map((i) => i.sk),
        ...remaining.map((i) => i.sk),
      ]);
      expect(allKeys.size).toBe(20);
    });

    it("should query a secondary index", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "gsiPk", value: "category-b" },
        indexName: "gsi-index",
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(5);
      expect(items.every((i) => i.gsiPk === "category-b")).toBe(true);
    });

    it("should support consistent read", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.query<TestItem>({
        key: { name: "pk", value: "user-1" },
        consistentRead: true,
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(20);
    });
  });

  describe("scan", () => {
    it("should scan all items in the table", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.scan<TestItem>()) {
        items.push(item);
      }

      // 20 (user-1) + 5 (user-2) + any put-test/del-test items
      expect(items.length).toBeGreaterThanOrEqual(25);
    });

    it("should support filter expression", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.scan<TestItem>({
        filter: { name: "pk", operator: "eq", value: "user-2" },
      })) {
        items.push(item);
      }

      expect(items).toHaveLength(5);
      expect(items.every((i) => i.pk === "user-2")).toBe(true);
    });

    it("should paginate with small maxResults", async () => {
      const items: TestItem[] = [];
      for await (const item of ds.scan<TestItem>({ maxResults: 3 })) {
        items.push(item);
      }

      expect(items.length).toBeGreaterThanOrEqual(25);
    });

    it("should support cursor-based resume", async () => {
      const listing = ds.scan<TestItem>({ maxResults: 5 });

      const firstBatch: TestItem[] = [];
      let count = 0;
      for await (const item of listing) {
        firstBatch.push(item);
        count++;
        if (count === 10) break;
      }
      expect(firstBatch).toHaveLength(10);
      expect(listing.cursor).toBeDefined();

      // Resume from cursor
      const remaining: TestItem[] = [];
      for await (const item of ds.scan<TestItem>({ cursor: listing.cursor })) {
        remaining.push(item);
      }

      expect(remaining.length).toBeGreaterThan(0);
    });
  });

  describe("batchGetItems", () => {
    it("should retrieve multiple items in one call", async () => {
      const result = await ds.batchGetItems<TestItem>([
        { pk: "user-1", sk: "order-000" },
        { pk: "user-1", sk: "order-001" },
        { pk: "user-2", sk: "order-000" },
      ]);

      expect(result.items).toHaveLength(3);
      expect(result.unprocessedKeys).toHaveLength(0);
    });

    it("should return empty items for non-existent keys", async () => {
      const result = await ds.batchGetItems([
        { pk: "non-existent-1", sk: "none" },
        { pk: "non-existent-2", sk: "none" },
      ]);

      expect(result.items).toHaveLength(0);
    });
  });

  describe("batchWriteItems", () => {
    it("should batch put multiple items", async () => {
      const result = await ds.batchWriteItems([
        { type: "put", item: { pk: "batch-test", sk: "item-1", name: "One" } },
        { type: "put", item: { pk: "batch-test", sk: "item-2", name: "Two" } },
        { type: "put", item: { pk: "batch-test", sk: "item-3", name: "Three" } },
      ]);

      expect(result.unprocessedOperations).toHaveLength(0);

      // Verify items were written
      const items = await ds.batchGetItems<TestItem>([
        { pk: "batch-test", sk: "item-1" },
        { pk: "batch-test", sk: "item-2" },
        { pk: "batch-test", sk: "item-3" },
      ]);
      expect(items.items).toHaveLength(3);
    });

    it("should batch delete multiple items", async () => {
      // First, put items to delete
      await ds.batchWriteItems([
        { type: "put", item: { pk: "batch-del", sk: "d1" } },
        { type: "put", item: { pk: "batch-del", sk: "d2" } },
      ]);

      const result = await ds.batchWriteItems([
        { type: "delete", key: { pk: "batch-del", sk: "d1" } },
        { type: "delete", key: { pk: "batch-del", sk: "d2" } },
      ]);

      expect(result.unprocessedOperations).toHaveLength(0);

      expect(await ds.getItem({ pk: "batch-del", sk: "d1" })).toBeNull();
      expect(await ds.getItem({ pk: "batch-del", sk: "d2" })).toBeNull();
    });

    it("should handle mixed put and delete operations", async () => {
      await ds.putItem({ pk: "batch-mix", sk: "to-delete" });

      const result = await ds.batchWriteItems([
        { type: "put", item: { pk: "batch-mix", sk: "new-item", name: "New" } },
        { type: "delete", key: { pk: "batch-mix", sk: "to-delete" } },
      ]);

      expect(result.unprocessedOperations).toHaveLength(0);

      expect(await ds.getItem({ pk: "batch-mix", sk: "to-delete" })).toBeNull();
      const newItem = await ds.getItem<TestItem>({ pk: "batch-mix", sk: "new-item" });
      expect(newItem!.name).toBe("New");
    });
  });
});
