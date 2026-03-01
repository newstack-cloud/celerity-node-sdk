import { describe, it, expect, vi, beforeEach } from "vitest";
import { DynamoDBItemListing } from "../../src/providers/dynamodb/dynamodb-item-listing";
import { DatastoreError } from "../../src/errors";

function mockClient() {
  return { send: vi.fn(), destroy: vi.fn() };
}

function mockTracer() {
  return {
    startSpan: vi.fn(),
    withSpan: vi.fn().mockImplementation((_name, fn, _attrs) => fn()),
  };
}

type TestItem = { pk: string; sk: string; value?: number };

describe("DynamoDBItemListing", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  describe("query mode", () => {
    it("handles multi-page pagination", async () => {
      client.send
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "a" }],
          LastEvaluatedKey: { pk: "u1", sk: "a" },
        })
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "b" }],
          LastEvaluatedKey: undefined,
        });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" }, maxResults: 1 },
      );

      const items: TestItem[] = [];
      for await (const item of listing) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it("updates cursor after each page", async () => {
      // DynamoDB cursor is page-level: set after all items from a page are yielded,
      // but only visible to the consumer when the NEXT item is yielded (control returns).
      // With 2 single-item pages, the cursor from page 1 becomes visible after item 2 is yielded.
      client.send
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "a" }],
          LastEvaluatedKey: { pk: "u1", sk: "a" },
        })
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "b" }],
          LastEvaluatedKey: undefined,
        });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" }, maxResults: 1 },
      );

      expect(listing.cursor).toBeUndefined();

      const items: TestItem[] = [];
      let cursorAfterSecondItem: string | undefined;

      for await (const item of listing) {
        items.push(item);
        if (items.length === 2) {
          // After consuming item 2 (from page 2), cursor from page 1 is set
          cursorAfterSecondItem = listing.cursor;
        }
      }

      expect(cursorAfterSecondItem).toBeDefined();
      expect(listing.cursor).toBeUndefined();
    });

    it("cursor is undefined after complete iteration", async () => {
      client.send.mockResolvedValueOnce({
        Items: [{ pk: "u1", sk: "a" }],
        LastEvaluatedKey: undefined,
      });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" } },
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing) {
        // consume all
      }

      expect(listing.cursor).toBeUndefined();
    });

    it("resumes from cursor", async () => {
      // DynamoDB cursor is page-level: set after all items from a page are yielded.
      // To capture a cursor we must cross a page boundary — consume 2 single-item pages
      // then break during page 2's iteration so page 1's cursor is visible.
      client.send
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "a" }],
          LastEvaluatedKey: { pk: "u1", sk: "a" },
        })
        .mockResolvedValueOnce({
          Items: [{ pk: "u1", sk: "b" }],
          LastEvaluatedKey: { pk: "u1", sk: "b" },
        });

      const listing1 = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" }, maxResults: 1 },
      );

      let count = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing1) {
        count++;
        if (count === 2) break; // Break after 2nd item (page 1 cursor now set)
      }

      const savedCursor = listing1.cursor;
      expect(savedCursor).toBeDefined();

      // Resume listing from cursor
      client.send.mockResolvedValueOnce({
        Items: [{ pk: "u1", sk: "c" }],
        LastEvaluatedKey: undefined,
      });

      const listing2 = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" }, cursor: savedCursor },
      );

      const items: TestItem[] = [];
      for await (const item of listing2) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      // Verify ExclusiveStartKey was passed from page 1's last evaluated key
      const command = client.send.mock.calls[2][0];
      expect(command.input.ExclusiveStartKey).toEqual({ pk: "u1", sk: "a" });
    });

    it("includes filter expression in query command", async () => {
      client.send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        {
          key: { name: "pk", value: "u1" },
          filter: { name: "status", operator: "eq", value: "active" },
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing) {
        // consume
      }

      const command = client.send.mock.calls[0][0];
      expect(command.input.FilterExpression).toBe("#f0 = :f0");
      expect(command.input.KeyConditionExpression).toBe("#k0 = :k0");
    });
  });

  describe("scan mode", () => {
    it("handles empty result set", async () => {
      client.send.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "scan",
        {},
      );

      const items: TestItem[] = [];
      for await (const item of listing) {
        items.push(item);
      }

      expect(items).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("wraps SDK errors in DatastoreError for query", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" } },
      );

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of listing) {
          // consume
        }
      }).rejects.toThrow(DatastoreError);
    });

    it("wraps SDK errors in DatastoreError for scan", async () => {
      client.send.mockRejectedValue(new Error("timeout"));

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "scan",
        {},
      );

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of listing) {
          // consume
        }
      }).rejects.toThrow(DatastoreError);
    });

    it("includes table name in error", async () => {
      client.send.mockRejectedValue(new Error("fail"));

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "my-table",
        "query",
        { key: { name: "pk", value: "x" } },
      );

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of listing) {
          // consume
        }
      } catch (error) {
        expect((error as DatastoreError).table).toBe("my-table");
      }
    });
  });

  describe("tracing", () => {
    it("calls withSpan per page for query", async () => {
      const tracer = mockTracer();
      client.send.mockResolvedValueOnce({
        Items: [{ pk: "u1", sk: "a" }],
        LastEvaluatedKey: undefined,
      });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" } },
        tracer,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing) {
        // consume
      }

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.query_page",
        expect.any(Function),
        { "datastore.table": "test-table" },
      );
    });

    it("calls withSpan per page for scan", async () => {
      const tracer = mockTracer();
      client.send.mockResolvedValueOnce({
        Items: [{ pk: "u1", sk: "a" }],
        LastEvaluatedKey: undefined,
      });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "scan",
        {},
        tracer,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing) {
        // consume
      }

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.datastore.scan_page",
        expect.any(Function),
        { "datastore.table": "test-table" },
      );
    });

    it("works without tracer", async () => {
      client.send.mockResolvedValueOnce({
        Items: [{ pk: "u1", sk: "a" }],
        LastEvaluatedKey: undefined,
      });

      const listing = new DynamoDBItemListing<TestItem>(
        client as never,
        "test-table",
        "query",
        { key: { name: "pk", value: "u1" } },
      );

      const items: TestItem[] = [];
      for await (const item of listing) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
    });
  });
});
