import { describe, it, expect } from "vitest";
import { DatastoreError, ConditionalCheckFailedError } from "../src/errors";

describe("DatastoreError", () => {
  it("sets name, message, and table", () => {
    const error = new DatastoreError("something failed", "my-table");
    expect(error.name).toBe("DatastoreError");
    expect(error.message).toBe("something failed");
    expect(error.table).toBe("my-table");
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause via ES-supported cause", () => {
    const cause = new Error("DynamoDB timeout");
    const error = new DatastoreError("put failed", "users", { cause });
    expect(error.cause).toBe(cause);
  });

  it("allows undefined cause", () => {
    const error = new DatastoreError("no cause", "data");
    expect(error.cause).toBeUndefined();
  });
});

describe("ConditionalCheckFailedError", () => {
  it("sets name, message, and table", () => {
    const error = new ConditionalCheckFailedError("users");
    expect(error.name).toBe("ConditionalCheckFailedError");
    expect(error.message).toBe('Conditional check failed on table "users"');
    expect(error.table).toBe("users");
  });

  it("extends DatastoreError", () => {
    const error = new ConditionalCheckFailedError("orders");
    expect(error).toBeInstanceOf(DatastoreError);
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause", () => {
    const cause = new Error("ConditionalCheckFailedException");
    const error = new ConditionalCheckFailedError("users", { cause });
    expect(error.cause).toBe(cause);
  });
});
