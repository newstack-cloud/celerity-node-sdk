import pg from "pg";
import { PG_TEST_CONFIG } from "../pg-test-config";

function createClient(): pg.Client {
  return new pg.Client({
    host: PG_TEST_CONFIG.host,
    port: PG_TEST_CONFIG.port,
    user: PG_TEST_CONFIG.user,
    password: PG_TEST_CONFIG.password,
    database: PG_TEST_CONFIG.database,
  });
}

export async function setup() {
  const client = createClient();
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL,
        category TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Clear any existing data
    await client.query("TRUNCATE test_items RESTART IDENTITY");

    // Seed test data
    const items = [
      { name: "alpha", value: 10, category: "group-a" },
      { name: "bravo", value: 20, category: "group-a" },
      { name: "charlie", value: 30, category: "group-b" },
      { name: "delta", value: 40, category: "group-b" },
      { name: "echo", value: 50, category: "group-a" },
    ];

    for (const item of items) {
      await client.query(
        "INSERT INTO test_items (name, value, category) VALUES ($1, $2, $3)",
        [item.name, item.value, item.category],
      );
    }
  } finally {
    await client.end();
  }
}

export async function teardown() {
  const client = createClient();
  await client.connect();

  try {
    await client.query("DROP TABLE IF EXISTS test_items");
  } catch {
    // Ignore cleanup errors
  } finally {
    await client.end();
  }
}
