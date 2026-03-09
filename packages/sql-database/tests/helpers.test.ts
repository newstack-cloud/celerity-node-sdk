import { describe, it, expect, vi } from "vitest";
import { getSqlWriter, getSqlReader, getSqlCredentials } from "../src/helpers";
import {
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
} from "../src/decorators";
import { mockContainer } from "./test-helpers";

describe("getSqlWriter", () => {
  it("resolves the resource-specific writer token", async () => {
    const fakeKnex = { __knex: "writer" };
    const container = mockContainer((token) =>
      token === sqlWriterToken("ordersDb") ? fakeKnex : undefined,
    );

    const result = await getSqlWriter(container, "ordersDb");

    expect(result).toBe(fakeKnex);
    expect(container.resolve).toHaveBeenCalledWith(sqlWriterToken("ordersDb"));
  });

  it("resolves the default writer token when no name given", async () => {
    const fakeKnex = { __knex: "defaultWriter" };
    const container = mockContainer((token) =>
      token === DEFAULT_SQL_WRITER_TOKEN ? fakeKnex : undefined,
    );

    const result = await getSqlWriter(container);

    expect(result).toBe(fakeKnex);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_SQL_WRITER_TOKEN);
  });
});

describe("getSqlReader", () => {
  it("resolves the resource-specific reader token", async () => {
    const fakeKnex = { __knex: "reader" };
    const container = mockContainer((token) =>
      token === sqlReaderToken("ordersDb") ? fakeKnex : undefined,
    );

    const result = await getSqlReader(container, "ordersDb");

    expect(result).toBe(fakeKnex);
    expect(container.resolve).toHaveBeenCalledWith(sqlReaderToken("ordersDb"));
  });

  it("resolves the default reader token when no name given", async () => {
    const fakeKnex = { __knex: "defaultReader" };
    const container = mockContainer((token) =>
      token === DEFAULT_SQL_READER_TOKEN ? fakeKnex : undefined,
    );

    const result = await getSqlReader(container);

    expect(result).toBe(fakeKnex);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_SQL_READER_TOKEN);
  });
});

describe("getSqlCredentials", () => {
  it("resolves the resource-specific credentials token", async () => {
    const fakeCreds = { getConnectionInfo: vi.fn() };
    const container = mockContainer((token) =>
      token === sqlDatabaseCredentialsToken("ordersDb") ? fakeCreds : undefined,
    );

    const result = await getSqlCredentials(container, "ordersDb");

    expect(result).toBe(fakeCreds);
    expect(container.resolve).toHaveBeenCalledWith(sqlDatabaseCredentialsToken("ordersDb"));
  });

  it("resolves the default credentials token when no name given", async () => {
    const fakeCreds = { getConnectionInfo: vi.fn() };
    const container = mockContainer((token) =>
      token === DEFAULT_SQL_CREDENTIALS_TOKEN ? fakeCreds : undefined,
    );

    const result = await getSqlCredentials(container);

    expect(result).toBe(fakeCreds);
    expect(container.resolve).toHaveBeenCalledWith(DEFAULT_SQL_CREDENTIALS_TOKEN);
  });
});
