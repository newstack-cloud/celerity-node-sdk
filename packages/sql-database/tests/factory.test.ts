import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SqlDatabaseCredentials, SqlConnectionInfo, SqlPasswordAuth } from "../src/types";
import { createKnexInstance } from "../src/factory";

const mockKnexInstance = { destroy: vi.fn() };
const mockCreateKnex = vi.fn().mockReturnValue(mockKnexInstance);

vi.mock("knex", () => ({
  default: (...args: unknown[]) => mockCreateKnex(...args),
}));

function mockCredentials(
  info: Partial<SqlConnectionInfo> = {},
  password = "testpass",
): SqlDatabaseCredentials {
  const fullInfo: SqlConnectionInfo = {
    host: "localhost",
    port: 5432,
    database: "testdb",
    user: "testuser",
    engine: "postgres",
    ssl: false,
    authMode: "password",
    ...info,
  };

  return {
    getConnectionInfo: vi.fn().mockResolvedValue(fullInfo),
    getPasswordAuth: vi.fn().mockResolvedValue({
      password,
      url: `postgresql://${fullInfo.user}:${password}@${fullInfo.host}:${fullInfo.port}/${fullInfo.database}`,
    } satisfies SqlPasswordAuth),
    getIamAuth: vi.fn().mockResolvedValue({
      token: "iam-token",
      url: `postgresql://${fullInfo.user}:iam-token@${fullInfo.host}:${fullInfo.port}/${fullInfo.database}`,
    }),
  };
}

describe("createKnexInstance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Knex instance with pg client for postgres engine", async () => {
    const creds = mockCredentials({ engine: "postgres" });
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    expect(mockCreateKnex).toHaveBeenCalledWith(
      expect.objectContaining({ client: "pg" }),
    );
  });

  it("creates a Knex instance with mysql2 client for mysql engine", async () => {
    const creds = mockCredentials({ engine: "mysql", port: 3306 });
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    expect(mockCreateKnex).toHaveBeenCalledWith(
      expect.objectContaining({ client: "mysql2" }),
    );
  });

  it("uses static connection config for password auth", async () => {
    const creds = mockCredentials();
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.connection).toEqual(
      expect.objectContaining({
        host: "localhost",
        port: 5432,
        user: "testuser",
        database: "testdb",
        password: "testpass",
      }),
    );
    expect(creds.getPasswordAuth).toHaveBeenCalled();
  });

  it("uses connection function for IAM auth", async () => {
    const creds = mockCredentials({ authMode: "iam", ssl: true });
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(typeof config.connection).toBe("function");
  });

  it("applies functions pool preset", async () => {
    const creds = mockCredentials();
    await createKnexInstance({ credentials: creds, deployTarget: "functions" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.pool.min).toBe(0);
    expect(config.pool.max).toBe(2);
    expect(config.pool.idleTimeoutMillis).toBe(1_000);
    expect(config.pool.reapIntervalMillis).toBe(500);
  });

  it("applies runtime pool preset", async () => {
    const creds = mockCredentials();
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.pool.min).toBe(2);
    expect(config.pool.max).toBe(10);
  });

  it("merges pool overrides", async () => {
    const creds = mockCredentials();
    await createKnexInstance({
      credentials: creds,
      deployTarget: "runtime",
      pool: { max: 25 },
    });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.pool.max).toBe(25);
    expect(config.pool.min).toBe(2); // from preset
  });

  it("disables SSL when ssl is false", async () => {
    const creds = mockCredentials({ ssl: false });
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.connection.ssl).toBe(false);
  });

  it("enables SSL with rejectUnauthorized when ssl is true", async () => {
    const creds = mockCredentials({ ssl: true });
    await createKnexInstance({ credentials: creds, deployTarget: "runtime" });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.connection.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("uses readHost when useReadHost is true", async () => {
    const creds = mockCredentials({ readHost: "reader.host" });
    await createKnexInstance({
      credentials: creds,
      deployTarget: "runtime",
      useReadHost: true,
    });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.connection.host).toBe("reader.host");
  });

  it("falls back to primary host when useReadHost is true but no readHost", async () => {
    const creds = mockCredentials();
    await createKnexInstance({
      credentials: creds,
      deployTarget: "runtime",
      useReadHost: true,
    });

    const config = mockCreateKnex.mock.calls[0][0];
    expect(config.connection.host).toBe("localhost");
  });
});
