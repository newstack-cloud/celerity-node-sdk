import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatastoreError, ConditionalCheckFailedError } from "../../src/errors";
import { DynamoDBDatastore } from "../../src/providers/dynamodb/dynamodb-datastore";

function mockClient() {
  return { send: vi.fn(), destroy: vi.fn() };
}

function mockTracer() {
  return {
    startSpan: vi.fn(),
    withSpan: vi.fn().mockImplementation((_name, fn, _attrs) => fn()),
  };
}

describe("DynamoDBDatastore", () => {
  let client: ReturnType<typeof mockClient>;
  let ds: DynamoDBDatastore;

  beforeEach(() => {
    client = mockClient();
    ds = new DynamoDBDatastore("test-table", client as never);
  });

  describe("getItem", () => {
    it("wraps SDK errors in DatastoreError", async () => {
      const sdkError = new Error("timeout");
      client.send.mockRejectedValue(sdkError);

      await expect(ds.getItem({ pk: "x" })).rejects.toThrow(DatastoreError);
      await expect(ds.getItem({ pk: "x" })).rejects.toMatchObject({
        table: "test-table",
      });
    });
  });

  describe("putItem", () => {
    it("wraps non-conditional SDK errors in DatastoreError", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      await expect(ds.putItem({ pk: "x" })).rejects.toThrow(DatastoreError);
    });
  });

  describe("deleteItem", () => {
    it("throws ConditionalCheckFailedError on condition failure", async () => {
      const sdkError = new Error("Condition not met");
      (sdkError as { name: string }).name = "ConditionalCheckFailedException";
      client.send.mockRejectedValue(sdkError);

      await expect(
        ds.deleteItem({ pk: "x" }, { condition: { name: "status", operator: "eq", value: "y" } }),
      ).rejects.toThrow(ConditionalCheckFailedError);
    });

    it("wraps non-conditional SDK errors in DatastoreError", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      await expect(ds.deleteItem({ pk: "x" })).rejects.toThrow(DatastoreError);
    });
  });

  describe("batchGetItems", () => {
    it("handles unprocessed keys", async () => {
      client.send.mockResolvedValue({
        Responses: { "test-table": [{ pk: "a", sk: "1" }] },
        UnprocessedKeys: {
          "test-table": { Keys: [{ pk: "b", sk: "2" }] },
        },
      });

      const result = await ds.batchGetItems([
        { pk: "a", sk: "1" },
        { pk: "b", sk: "2" },
      ]);

      expect(result.items).toHaveLength(1);
      expect(result.unprocessedKeys).toHaveLength(1);
      expect(result.unprocessedKeys[0]).toEqual({ pk: "b", sk: "2" });
    });

    it("passes consistentRead option", async () => {
      client.send.mockResolvedValue({ Responses: {}, UnprocessedKeys: {} });

      await ds.batchGetItems([{ pk: "a" }], { consistentRead: true });

      const command = client.send.mock.calls[0][0];
      expect(command.input.RequestItems["test-table"].ConsistentRead).toBe(true);
    });

    it("wraps SDK errors in DatastoreError", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      await expect(ds.batchGetItems([{ pk: "a" }])).rejects.toThrow(DatastoreError);
    });
  });

  describe("batchWriteItems", () => {
    it("maps unprocessed items back to BatchWriteOperation", async () => {
      client.send.mockResolvedValue({
        UnprocessedItems: {
          "test-table": [
            { PutRequest: { Item: { pk: "a", sk: "1" } } },
            { DeleteRequest: { Key: { pk: "b", sk: "2" } } },
          ],
        },
      });

      const result = await ds.batchWriteItems([
        { type: "put", item: { pk: "a", sk: "1" } },
        { type: "delete", key: { pk: "b", sk: "2" } },
      ]);

      expect(result.unprocessedOperations).toHaveLength(2);
      expect(result.unprocessedOperations[0]).toEqual({
        type: "put",
        item: { pk: "a", sk: "1" },
      });
      expect(result.unprocessedOperations[1]).toEqual({
        type: "delete",
        key: { pk: "b", sk: "2" },
      });
    });

    it("wraps SDK errors in DatastoreError", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      await expect(
        ds.batchWriteItems([{ type: "put", item: { pk: "a" } }]),
      ).rejects.toThrow(DatastoreError);
    });
  });

  describe("tracing", () => {
    it("calls withSpan with correct span name and attributes for getItem", async () => {
      const tracer = mockTracer();
      const traced = new DynamoDBDatastore("test-table", client as never, tracer);
      client.send.mockResolvedValue({ Item: { pk: "x" } });

      await traced.getItem({ pk: "x" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.get_item",
        expect.any(Function),
        { "datastore.table": "test-table" },
      );
    });

    it("calls withSpan for putItem", async () => {
      const tracer = mockTracer();
      const traced = new DynamoDBDatastore("test-table", client as never, tracer);
      client.send.mockResolvedValue({});

      await traced.putItem({ pk: "x" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.put_item",
        expect.any(Function),
        { "datastore.table": "test-table" },
      );
    });

    it("calls withSpan for deleteItem", async () => {
      const tracer = mockTracer();
      const traced = new DynamoDBDatastore("test-table", client as never, tracer);
      client.send.mockResolvedValue({});

      await traced.deleteItem({ pk: "x" });

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.delete_item",
        expect.any(Function),
        { "datastore.table": "test-table" },
      );
    });

    it("calls withSpan for batchGetItems", async () => {
      const tracer = mockTracer();
      const traced = new DynamoDBDatastore("test-table", client as never, tracer);
      client.send.mockResolvedValue({ Responses: {}, UnprocessedKeys: {} });

      await traced.batchGetItems([{ pk: "a" }, { pk: "b" }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.batch_get_items",
        expect.any(Function),
        { "datastore.table": "test-table", "datastore.batch_size": 2 },
      );
    });

    it("calls withSpan for batchWriteItems", async () => {
      const tracer = mockTracer();
      const traced = new DynamoDBDatastore("test-table", client as never, tracer);
      client.send.mockResolvedValue({ UnprocessedItems: {} });

      await traced.batchWriteItems([{ type: "put", item: { pk: "a" } }]);

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.batch_write_items",
        expect.any(Function),
        { "datastore.table": "test-table", "datastore.batch_size": 1 },
      );
    });

    it("works without a tracer", async () => {
      client.send.mockResolvedValue({ Item: { pk: "x" } });

      const result = await ds.getItem({ pk: "x" });

      expect(result).toEqual({ pk: "x" });
    });
  });
});
