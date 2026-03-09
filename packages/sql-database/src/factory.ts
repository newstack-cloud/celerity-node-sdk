import type { Knex } from "knex";
import type { DeployTarget, PoolConfig, SqlDatabaseCredentials } from "./types";
import { resolvePoolConfig } from "./config";

export type CreateKnexOptions = {
  credentials: SqlDatabaseCredentials;
  deployTarget: DeployTarget;
  pool?: Partial<PoolConfig>;
  useReadHost?: boolean;
};

const ENGINE_CLIENT: Record<string, string> = {
  postgres: "pg",
  mysql: "mysql2",
};

export async function createKnexInstance(options: CreateKnexOptions): Promise<Knex> {
  const { credentials, deployTarget, pool: poolOverrides, useReadHost } = options;

  const pkg = "knex";
  const { default: createKnex } = (await import(pkg)) as { default: typeof import("knex").knex };

  const info = await credentials.getConnectionInfo();
  const client = ENGINE_CLIENT[info.engine];
  if (!client) {
    throw new Error(`Unsupported SQL engine: "${info.engine}"`);
  }

  const poolConfig = resolvePoolConfig(deployTarget, poolOverrides);
  const host = useReadHost && info.readHost ? info.readHost : info.host;

  const sslConfig = info.ssl ? { rejectUnauthorized: true } : false;

  const knexPool = {
    min: poolConfig.min,
    max: poolConfig.max,
    idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    acquireTimeoutMillis: poolConfig.acquireTimeoutMillis,
    createTimeoutMillis: poolConfig.createTimeoutMillis,
    reapIntervalMillis: poolConfig.reapIntervalMillis,
  };

  if (info.authMode === "iam") {
    // Dynamic connection function — each new pool connection gets a fresh token
    return createKnex({
      client,
      connection: async () => {
        const auth = await credentials.getIamAuth();
        return {
          host,
          port: info.port,
          user: info.user,
          database: info.database,
          password: auth.token,
          ssl: sslConfig,
        };
      },
      pool: knexPool,
    });
  }

  // Password auth — static connection config
  const auth = await credentials.getPasswordAuth();
  return createKnex({
    client,
    connection: {
      host,
      port: info.port,
      user: info.user,
      database: info.database,
      password: auth.password,
      ssl: sslConfig,
    },
    pool: knexPool,
  });
}
