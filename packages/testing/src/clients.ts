import type { ResourceTokenInfo } from "./discovery";
import type { BlueprintResource } from "./blueprint";

type Closeable = { close?(): void | Promise<void> };

/**
 * Creates real resource client handles for integration testing by dynamically
 * importing the relevant SDK package and calling its factory with local env vars.
 *
 * Each resource package is an optional peer dependency — only the packages
 * actually needed by the module under test are imported.
 *
 * Returns a map of token → real resource handle, plus a list of clients
 * that need closing when tests finish.
 */
export async function createRealClients(
  tokens: ResourceTokenInfo[],
  blueprintResources: Map<string, BlueprintResource>,
): Promise<{ handles: Map<symbol, unknown>; closeables: Closeable[] }> {
  const handles = new Map<symbol, unknown>();
  const closeables: Closeable[] = [];

  // Group tokens by type to share a single client per resource type.
  const byType = new Map<string, ResourceTokenInfo[]>();
  for (const info of tokens) {
    const group = byType.get(info.type) ?? [];
    group.push(info);
    byType.set(info.type, group);
  }

  for (const [type, infos] of byType) {
    try {
      switch (type) {
        case "datastore":
          await createDatastoreHandles(infos, blueprintResources, handles, closeables);
          break;
        case "topic":
          await createTopicHandles(infos, blueprintResources, handles, closeables);
          break;
        case "queue":
          await createQueueHandles(infos, blueprintResources, handles, closeables);
          break;
        case "cache":
          await createCacheHandles(infos, handles, closeables);
          break;
        case "bucket":
          await createBucketHandles(infos, blueprintResources, handles, closeables);
          break;
        case "sqlDatabase":
          await createSqlHandles(infos, blueprintResources, handles, closeables);
          break;
        case "config":
          await createConfigHandles(infos, handles);
          break;
      }
    } catch (err) {
      const pkg = type === "sqlDatabase" ? "sql-database" : type;
      throw new Error(
        `Failed to create ${type} client for integration test. ` +
          `Is @celerity-sdk/${pkg} installed? Error: ${err}`,
      );
    }
  }

  return { handles, closeables };
}

function physicalName(info: ResourceTokenInfo, bp: Map<string, BlueprintResource>): string {
  return bp.get(info.name)?.physicalName ?? info.name;
}

async function createConfigHandles(
  infos: ResourceTokenInfo[],
  handles: Map<symbol, unknown>,
): Promise<void> {
  const { ConfigNamespaceImpl, LocalConfigBackend } = await import("@celerity-sdk/config");
  const backend = new LocalConfigBackend();

  for (const info of infos) {
    const envKey = info.name.toUpperCase();
    const storeId = process.env[`CELERITY_CONFIG_${envKey}_STORE_ID`] ?? info.name;
    const ns = new ConfigNamespaceImpl(backend, storeId);
    handles.set(info.token, ns);
  }
}

async function createDatastoreHandles(
  infos: ResourceTokenInfo[],
  bp: Map<string, BlueprintResource>,
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const { createDatastoreClient } = await import("@celerity-sdk/datastore");
  const client = await createDatastoreClient({ provider: "local" });
  closeables.push(client);
  for (const info of infos) {
    handles.set(info.token, client.datastore(physicalName(info, bp)));
  }
}

async function createTopicHandles(
  infos: ResourceTokenInfo[],
  bp: Map<string, BlueprintResource>,
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const { createTopicClient } = await import("@celerity-sdk/topic");
  const client = await createTopicClient({ provider: "local" });
  closeables.push(client);
  for (const info of infos) {
    handles.set(info.token, client.topic(physicalName(info, bp)));
  }
}

async function createQueueHandles(
  infos: ResourceTokenInfo[],
  bp: Map<string, BlueprintResource>,
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const { createQueueClient } = await import("@celerity-sdk/queue");
  const client = await createQueueClient({ provider: "local" });
  closeables.push(client);
  for (const info of infos) {
    handles.set(info.token, client.queue(physicalName(info, bp)));
  }
}

async function createCacheHandles(
  infos: ResourceTokenInfo[],
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const { createCacheClient } = await import("@celerity-sdk/cache");
  // For local environments, read connection info from CELERITY_REDIS_ENDPOINT.
  const endpoint = process.env.CELERITY_REDIS_ENDPOINT ?? "redis://localhost:6379";
  const url = new URL(endpoint);
  const client = await createCacheClient({
    config: {
      host: url.hostname,
      port: Number.parseInt(url.port || "6379", 10),
      tls: false,
      clusterMode: false,
      authMode: "password" as const,
      connectionConfig: {
        connectTimeoutMs: 5000,
        commandTimeoutMs: 5000,
        keepAliveMs: 0,
        maxRetries: 3,
        retryDelayMs: 100,
        lazyConnect: false,
      },
    },
  });
  closeables.push(client);
  for (const info of infos) {
    handles.set(info.token, client.cache(info.name));
  }
}

async function createBucketHandles(
  infos: ResourceTokenInfo[],
  bp: Map<string, BlueprintResource>,
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const { createObjectStorage } = await import("@celerity-sdk/bucket");
  const client = await createObjectStorage({ provider: "local" });
  closeables.push(client);
  for (const info of infos) {
    handles.set(info.token, client.bucket(physicalName(info, bp)));
  }
}

async function createSqlHandles(
  infos: ResourceTokenInfo[],
  bp: Map<string, BlueprintResource>,
  handles: Map<symbol, unknown>,
  closeables: Closeable[],
): Promise<void> {
  const connStr = process.env.CELERITY_LOCAL_SQL_DATABASE_ENDPOINT;
  if (!connStr) {
    throw new Error(
      "CELERITY_LOCAL_SQL_DATABASE_ENDPOINT must be set for SQL database integration tests",
    );
  }

  const { createKnexInstance } = await import("@celerity-sdk/sql-database");

  // SQL tokens include a sub-type prefix in the name:
  //   celerity:sqlDatabase:writer:auditDatabase → name = "writer:auditDatabase"
  //   celerity:sqlDatabase:reader:auditDatabase → name = "reader:auditDatabase"
  // Multiple tokens may share the same underlying database, so we deduplicate
  // by resource name and share a single Knex instance per database.
  const knexByResource = new Map<string, ReturnType<typeof createKnexInstance>>();

  for (const info of infos) {
    const resourceName = sqlResourceName(info.name);
    const lookupInfo = { ...info, name: resourceName };
    const dbName = physicalName(lookupInfo, bp);

    if (!knexByResource.has(dbName)) {
      const url = new URL(connStr);
      const engine = sqlEngineFromProtocol(url.protocol);
      const defaultPort = engine === "mysql" ? "3306" : "5432";
      const knexPromise = createKnexInstance({
        credentials: {
          getConnectionInfo: async () => ({
            engine,
            host: url.hostname,
            port: Number.parseInt(url.port || defaultPort, 10),
            user: url.username,
            database: dbName,
            ssl: false,
            authMode: "password" as const,
          }),
          getPasswordAuth: async () => ({
            password: url.password,
            url: connStr,
          }),
          getIamAuth: async () => {
            throw new Error("IAM auth not supported in local mode");
          },
        },
        deployTarget: "functions",
      });
      knexByResource.set(dbName, knexPromise);
      closeables.push({ close: async () => (await knexPromise).destroy() });
    }

    const knex = await knexByResource.get(dbName)!;
    handles.set(info.token, knex);
  }
}

function sqlEngineFromProtocol(protocol: string): "postgres" | "mysql" {
  if (protocol === "mysql:" || protocol === "mysql2:") return "mysql";
  return "postgres";
}

/**
 * Extract the resource name from a sqlDatabase token name.
 * Token names have the format "writer:resourceName", "reader:resourceName", etc.
 * Returns just the resource name part for blueprint lookup.
 */
function sqlResourceName(tokenName: string): string {
  const colonIdx = tokenName.indexOf(":");
  if (colonIdx === -1) return tokenName;
  return tokenName.slice(colonIdx + 1);
}
