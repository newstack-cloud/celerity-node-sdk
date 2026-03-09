import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  SqlDatabase,
  SqlWriter,
  SqlReader,
  SqlCredentials,
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
} from "../src/decorators";

const INJECT_KEY = Symbol.for("celerity:inject");
const USE_RESOURCE_KEY = Symbol.for("celerity:useResource");

describe("@SqlDatabase() decorator", () => {
  it("writes the writer inject token for a named resource", () => {
    class TestHandler {
      constructor(@SqlDatabase("ordersDb") _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(sqlWriterToken("ordersDb"));
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@SqlDatabase("ordersDb") _db: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["ordersDb"]);
  });

  it("writes DEFAULT_SQL_WRITER_TOKEN when no resource name given", () => {
    class TestHandler {
      constructor(@SqlDatabase() _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_SQL_WRITER_TOKEN);
  });

  it("does not write USE_RESOURCE metadata for unnamed resources", () => {
    class TestHandler {
      constructor(@SqlDatabase() _db: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toBeUndefined();
  });
});

describe("@SqlWriter() decorator", () => {
  it("resolves to the same token as @SqlDatabase", () => {
    class TestHandler {
      constructor(@SqlWriter("ordersDb") _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(sqlWriterToken("ordersDb"));
  });

  it("uses the same default token as @SqlDatabase", () => {
    class TestHandler {
      constructor(@SqlWriter() _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_SQL_WRITER_TOKEN);
  });
});

describe("@SqlReader() decorator", () => {
  it("writes the reader inject token for a named resource", () => {
    class TestHandler {
      constructor(@SqlReader("ordersDb") _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(sqlReaderToken("ordersDb"));
  });

  it("writes DEFAULT_SQL_READER_TOKEN when no resource name given", () => {
    class TestHandler {
      constructor(@SqlReader() _db: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_SQL_READER_TOKEN);
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@SqlReader("ordersDb") _db: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["ordersDb"]);
  });
});

describe("@SqlCredentials() decorator", () => {
  it("writes the credentials inject token for a named resource", () => {
    class TestHandler {
      constructor(@SqlCredentials("ordersDb") _creds: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(sqlDatabaseCredentialsToken("ordersDb"));
  });

  it("writes DEFAULT_SQL_CREDENTIALS_TOKEN when no resource name given", () => {
    class TestHandler {
      constructor(@SqlCredentials() _creds: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_SQL_CREDENTIALS_TOKEN);
  });
});

describe("cross-decorator accumulation", () => {
  it("accumulates inject tokens across multiple decorator types", () => {
    class TestHandler {
      constructor(
        @SqlDatabase("ordersDb") _writer: unknown,
        @SqlReader("ordersDb") _reader: unknown,
        @SqlCredentials("analyticsDb") _creds: unknown,
      ) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(sqlWriterToken("ordersDb"));
    expect(injectMap.get(1)).toBe(sqlReaderToken("ordersDb"));
    expect(injectMap.get(2)).toBe(sqlDatabaseCredentialsToken("analyticsDb"));
  });

  it("accumulates USE_RESOURCE metadata without duplicates", () => {
    class TestHandler {
      constructor(
        @SqlDatabase("ordersDb") _writer: unknown,
        @SqlReader("ordersDb") _reader: unknown,
        @SqlCredentials("analyticsDb") _creds: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toContain("ordersDb");
    expect(resources).toContain("analyticsDb");
    expect(resources).toHaveLength(2);
  });
});

describe("token factories", () => {
  it("sqlWriterToken returns consistent symbols", () => {
    expect(sqlWriterToken("db")).toBe(Symbol.for("celerity:sqlDatabase:writer:db"));
    expect(sqlWriterToken("db")).toBe(sqlWriterToken("db"));
    expect(sqlWriterToken("a")).not.toBe(sqlWriterToken("b"));
  });

  it("sqlReaderToken returns consistent symbols", () => {
    expect(sqlReaderToken("db")).toBe(Symbol.for("celerity:sqlDatabase:reader:db"));
  });

  it("sqlDatabaseCredentialsToken returns consistent symbols", () => {
    expect(sqlDatabaseCredentialsToken("db")).toBe(
      Symbol.for("celerity:sqlDatabase:credentials:db"),
    );
  });
});

describe("default tokens", () => {
  it("DEFAULT_SQL_WRITER_TOKEN is a well-known symbol", () => {
    expect(DEFAULT_SQL_WRITER_TOKEN).toBe(Symbol.for("celerity:sqlDatabase:writer:default"));
  });

  it("DEFAULT_SQL_READER_TOKEN is a well-known symbol", () => {
    expect(DEFAULT_SQL_READER_TOKEN).toBe(Symbol.for("celerity:sqlDatabase:reader:default"));
  });

  it("DEFAULT_SQL_CREDENTIALS_TOKEN is a well-known symbol", () => {
    expect(DEFAULT_SQL_CREDENTIALS_TOKEN).toBe(
      Symbol.for("celerity:sqlDatabase:credentials:default"),
    );
  });
});
