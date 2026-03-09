import { describe, it, expect, vi } from "vitest";
import { SqlDatabaseInstance } from "../src/sql-database";

function mockKnex(label: string) {
  return {
    destroy: vi.fn().mockResolvedValue(undefined),
    __label: label,
  } as unknown as import("knex").Knex;
}

describe("SqlDatabaseInstance", () => {
  it("returns the writer Knex instance", () => {
    const writer = mockKnex("writer");
    const instance = new SqlDatabaseInstance(writer);
    expect(instance.writer()).toBe(writer);
  });

  it("returns the reader Knex instance when provided", () => {
    const writer = mockKnex("writer");
    const reader = mockKnex("reader");
    const instance = new SqlDatabaseInstance(writer, reader);
    expect(instance.reader()).toBe(reader);
  });

  it("falls back reader to writer when no reader provided", () => {
    const writer = mockKnex("writer");
    const instance = new SqlDatabaseInstance(writer);
    expect(instance.reader()).toBe(writer);
  });

  it("destroys only the writer pool when reader is the same instance", async () => {
    const writer = mockKnex("writer");
    const instance = new SqlDatabaseInstance(writer);

    await instance.close();

    expect(writer.destroy).toHaveBeenCalledOnce();
  });

  it("destroys both pools when reader is a separate instance", async () => {
    const writer = mockKnex("writer");
    const reader = mockKnex("reader");
    const instance = new SqlDatabaseInstance(writer, reader);

    await instance.close();

    expect(writer.destroy).toHaveBeenCalledOnce();
    expect(reader.destroy).toHaveBeenCalledOnce();
  });
});
