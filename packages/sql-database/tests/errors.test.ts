import { describe, it, expect } from "vitest";
import { SqlDatabaseError } from "../src/errors";

describe("SqlDatabaseError", () => {
  it("sets name, message, and database", () => {
    const error = new SqlDatabaseError("connection failed", "ordersDb");
    expect(error.name).toBe("SqlDatabaseError");
    expect(error.message).toBe("connection failed");
    expect(error.database).toBe("ordersDb");
    expect(error).toBeInstanceOf(Error);
  });

  it("chains the underlying cause", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new SqlDatabaseError("connect failed", "ordersDb", { cause });
    expect(error.cause).toBe(cause);
  });

  it("allows undefined cause", () => {
    const error = new SqlDatabaseError("missing config", "ordersDb");
    expect(error.cause).toBeUndefined();
  });
});
