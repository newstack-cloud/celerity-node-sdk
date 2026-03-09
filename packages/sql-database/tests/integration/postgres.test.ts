import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PoolConfig } from "../../src/types";
import { resolveDatabaseCredentials } from "../../src/credentials";
import { createKnexInstance } from "../../src/factory";
import { SqlDatabaseInstance } from "../../src/sql-database";
import { mockNamespace, PG_TEST_CONFIG } from "../test-helpers";

type TestItem = {
  id: number;
  name: string;
  value: number;
  category: string;
  created_at: Date;
};

// Lazy pool — avoid eager connection creation in tests
const TEST_POOL: Partial<PoolConfig> = { min: 0, max: 2 };

const resourceConfig = mockNamespace({
  testDb_host: PG_TEST_CONFIG.host,
  testDb_port: String(PG_TEST_CONFIG.port),
  testDb_database: PG_TEST_CONFIG.database,
  testDb_user: PG_TEST_CONFIG.user,
  testDb_password: PG_TEST_CONFIG.password,
  testDb_engine: "postgres",
  testDb_ssl: "false",
});

describe("credentials resolution (integration)", () => {
  it("resolves connection info from config namespace", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const info = await credentials.getConnectionInfo();

    expect(info.host).toBe(PG_TEST_CONFIG.host);
    expect(info.port).toBe(PG_TEST_CONFIG.port);
    expect(info.database).toBe(PG_TEST_CONFIG.database);
    expect(info.user).toBe(PG_TEST_CONFIG.user);
    expect(info.engine).toBe("postgres");
    expect(info.ssl).toBe(false);
    expect(info.authMode).toBe("password");
  });

  it("resolves password auth with connection URL", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const auth = await credentials.getPasswordAuth();

    expect(auth.password).toBe(PG_TEST_CONFIG.password);
    expect(auth.url).toContain(
      `${PG_TEST_CONFIG.host}:${PG_TEST_CONFIG.port}/${PG_TEST_CONFIG.database}`,
    );
  });
});

describe("createKnexInstance (integration)", () => {
  it("creates a working Knex instance connected to PostgreSQL", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const knex = await createKnexInstance({ credentials, deployTarget: "runtime", pool: TEST_POOL });

    try {
      const result = await knex.raw("SELECT 1 AS num");
      expect(result.rows[0].num).toBe(1);
    } finally {
      await knex.destroy();
    }
  });

  it("applies pool configuration", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const knex = await createKnexInstance({
      credentials,
      deployTarget: "functions",
      pool: { min: 0, max: 1 },
    });

    try {
      const result = await knex.raw("SELECT 1 AS num");
      expect(result.rows[0].num).toBe(1);
    } finally {
      await knex.destroy();
    }
  });
});

describe("Knex queries (integration)", () => {
  let knexInstance: Awaited<ReturnType<typeof createKnexInstance>>;

  beforeAll(async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    knexInstance = await createKnexInstance({ credentials, deployTarget: "runtime", pool: TEST_POOL });
  });

  afterAll(async () => {
    if (knexInstance) await knexInstance.destroy();
  });

  it("selects all seeded rows", async () => {
    const rows = await knexInstance<TestItem>("test_items").select("*").orderBy("id");
    expect(rows).toHaveLength(5);
    expect(rows[0].name).toBe("alpha");
    expect(rows[4].name).toBe("echo");
  });

  it("filters rows by category", async () => {
    const rows = await knexInstance<TestItem>("test_items")
      .where("category", "group-b")
      .orderBy("id");
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("charlie");
    expect(rows[1].name).toBe("delta");
  });

  it("inserts and retrieves a new row", async () => {
    const [inserted] = await knexInstance<TestItem>("test_items")
      .insert({ name: "foxtrot", value: 60, category: "group-c" })
      .returning("*");

    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.name).toBe("foxtrot");

    const retrieved = await knexInstance<TestItem>("test_items").where("id", inserted.id).first();
    expect(retrieved).toBeDefined();
    expect(retrieved!.value).toBe(60);

    // Clean up
    await knexInstance("test_items").where("id", inserted.id).delete();
  });

  it("updates a row", async () => {
    const updated = await knexInstance<TestItem>("test_items")
      .where("name", "alpha")
      .update({ value: 100 })
      .returning("*");

    expect(updated[0].value).toBe(100);

    // Restore original value
    await knexInstance("test_items").where("name", "alpha").update({ value: 10 });
  });

  it("aggregates with sum", async () => {
    const [result] = await knexInstance("test_items")
      .where("category", "group-a")
      .sum("value as total");

    // alpha(10) + bravo(20) + echo(50) = 80
    expect(Number(result.total)).toBe(80);
  });
});

describe("SqlDatabaseInstance (integration)", () => {
  it("writer and reader both return valid Knex instances", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const writer = await createKnexInstance({ credentials, deployTarget: "runtime", pool: TEST_POOL });
    const instance = new SqlDatabaseInstance(writer);

    const writeResult = await instance.writer().raw("SELECT 1 AS num");
    expect(writeResult.rows[0].num).toBe(1);

    // Reader falls back to writer (no read replica in test)
    const readResult = await instance.reader().raw("SELECT 2 AS num");
    expect(readResult.rows[0].num).toBe(2);

    await instance.close();
  });

  it("close() destroys the connection pool", async () => {
    const credentials = await resolveDatabaseCredentials("testDb", resourceConfig);
    const writer = await createKnexInstance({ credentials, deployTarget: "runtime", pool: TEST_POOL });
    const instance = new SqlDatabaseInstance(writer);
    await instance.close();

    // Querying after close should fail
    await expect(instance.writer().raw("SELECT 1")).rejects.toThrow();
  });
});
