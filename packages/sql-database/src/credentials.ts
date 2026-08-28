import type { ConfigNamespace, SecretResolver } from "@celerity-sdk/config";
import type {
  SqlAuthMode,
  SqlConnectionInfo,
  SqlCredentialsOptions,
  SqlDatabaseCredentials,
  SqlEngine,
  SqlIamAuth,
  SqlPasswordAuth,
  TokenProvider,
  TokenProviderFactory,
} from "./types";
import { SqlDatabaseError } from "./errors";

const DEFAULT_PORTS: Record<SqlEngine, number> = {
  postgres: 5432,
  mysql: 3306,
};

export type ConnectionUrlParams = {
  engine: SqlEngine;
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
};

export function buildConnectionUrl(params: ConnectionUrlParams): string {
  const { engine, user, password, host, port, database, ssl } = params;
  const encodedPassword = encodeURIComponent(password);
  const protocol = engine === "postgres" ? "postgresql" : "mysql";
  const sslParam = ssl ? (engine === "postgres" ? "?sslmode=require" : "?ssl=true") : "";
  return `${protocol}://${user}:${encodedPassword}@${host}:${port}/${database}${sslParam}`;
}

export async function resolveDatabaseCredentials(
  configKey: string,
  resourceConfig: ConfigNamespace,
  options: SqlCredentialsOptions = {},
): Promise<SqlDatabaseCredentials> {
  const { tokenProviderFactory, secrets } = options;

  const host = await resourceConfig.get(`${configKey}_host`);
  if (!host) {
    throw new SqlDatabaseError(`Missing required config key "${configKey}_host"`, configKey);
  }

  const user = await resourceConfig.get(`${configKey}_user`);
  if (!user) {
    throw new SqlDatabaseError(`Missing required config key "${configKey}_user"`, configKey);
  }

  const engineRaw = await resourceConfig.get(`${configKey}_engine`);
  const engine: SqlEngine = engineRaw === "mysql" ? "mysql" : "postgres";

  const portRaw = await resourceConfig.get(`${configKey}_port`);
  const port = portRaw ? Number.parseInt(portRaw, 10) : DEFAULT_PORTS[engine];

  const databaseName = (await resourceConfig.get(`${configKey}_database`)) ?? configKey;

  const authModeRaw = await resourceConfig.get(`${configKey}_authMode`);
  const authMode: SqlAuthMode = authModeRaw === "iam" ? "iam" : "password";

  const sslRaw = await resourceConfig.get(`${configKey}_ssl`);
  // IAM auth forces SSL; otherwise default to true
  const ssl = authMode === "iam" ? true : sslRaw !== "false";

  const readHost = await resourceConfig.get(`${configKey}_readHost`);

  const connectionInfo: SqlConnectionInfo = {
    host,
    port,
    database: databaseName,
    user,
    engine,
    ssl,
    authMode,
    ...(readHost ? { readHost } : {}),
  };

  if (authMode === "password") {
    const password = await resolvePassword(configKey, resourceConfig, secrets);
    return new PasswordCredentials(connectionInfo, password);
  }

  if (!tokenProviderFactory) {
    throw new SqlDatabaseError(
      `IAM auth requires a tokenProviderFactory for config key "${configKey}"`,
      configKey,
    );
  }

  return new IamCredentials(connectionInfo, tokenProviderFactory);
}

/**
 * The application user's password, from wherever this environment keeps it.
 *
 * Local development seeds the literal into the namespace, because there it is a
 * fixed constant nobody needs to protect. A deployed database has a generated
 * password living in a secret, and the namespace carries a reference to it. The
 * password can rotate, and a copy in the parameter store would keep working
 * right up until it silently did not.
 *
 * Neither the store the secret lives in nor the shape it is stored in is this
 * function's business. A reference is an opaque id handed to whoever knows how
 * to read it, and what comes back is taken either way:
 *
 * - a JSON object, from which the `password` field is read. AWS deploys create
 *   the secret in this shape to match an AWS-managed RDS secret, so the same
 *   rotation tooling works against either.
 * - anything else, which is the password itself. A secret store that holds a
 *   plain string, as one holding a generated database password commonly does,
 *   needs no wrapper to be readable here.
 *
 * Only the password is taken from an object; the user comes from config.
 */
async function resolvePassword(
  configKey: string,
  resourceConfig: ConfigNamespace,
  secrets: SecretResolver | undefined,
): Promise<string> {
  const literal = await resourceConfig.get(`${configKey}_password`);
  if (literal) return literal;

  const secretId = await resourceConfig.get(`${configKey}_credentialsSecretId`);
  if (!secretId) {
    throw new SqlDatabaseError(
      `Missing "${configKey}_password" and "${configKey}_credentialsSecretId"; ` +
        "password auth needs one of them",
      configKey,
    );
  }

  if (!secrets) {
    throw new SqlDatabaseError(
      `"${configKey}_credentialsSecretId" refers to a secret, but no secret store is ` +
        "configured for this platform",
      configKey,
    );
  }

  let raw: string;
  try {
    raw = await secrets.getString(secretId);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new SqlDatabaseError(
      `reading credentials for "${configKey}" from ${secretId}: ${cause}`,
      configKey,
    );
  }

  const fields = credentialFields(raw);
  if (!fields) return raw;

  // An object that carries no password is a secret of the wrong kind rather
  // than a password that happens to look like JSON, for example, one pointed at the master
  // secret by mistake. Reading it as the password would send the whole
  // object as one.
  const password = fields.password;
  if (typeof password !== "string" || password.length === 0) {
    throw new SqlDatabaseError(
      `the secret ${secretId} for "${configKey}" is an object with no password field`,
      configKey,
    );
  }
  return password;
}

/** The secret read as an object of credential fields, or null where it is not one. */
function credentialFields(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

class PasswordCredentials implements SqlDatabaseCredentials {
  constructor(
    private readonly info: SqlConnectionInfo,
    private readonly password: string,
  ) {}

  async getConnectionInfo(): Promise<SqlConnectionInfo> {
    return this.info;
  }

  async getPasswordAuth(): Promise<SqlPasswordAuth> {
    const { engine, user, host, port, database, ssl } = this.info;
    const url = buildConnectionUrl({
      engine,
      user,
      password: this.password,
      host,
      port,
      database,
      ssl,
    });

    const readUrl = this.info.readHost
      ? buildConnectionUrl({
          engine,
          user,
          password: this.password,
          host: this.info.readHost,
          port,
          database,
          ssl,
        })
      : undefined;

    return { password: this.password, url, ...(readUrl ? { readUrl } : {}) };
  }

  async getIamAuth(): Promise<SqlIamAuth> {
    throw new SqlDatabaseError(
      'Cannot call getIamAuth() when authMode is "password"',
      this.info.database,
    );
  }
}

class IamCredentials implements SqlDatabaseCredentials {
  private tokenProvider: TokenProvider | null = null;
  private readTokenProvider: TokenProvider | null = null;

  constructor(
    private readonly info: SqlConnectionInfo,
    private readonly factory: TokenProviderFactory,
  ) {}

  async getConnectionInfo(): Promise<SqlConnectionInfo> {
    return this.info;
  }

  async getPasswordAuth(): Promise<SqlPasswordAuth> {
    throw new SqlDatabaseError(
      'Cannot call getPasswordAuth() when authMode is "iam"',
      this.info.database,
    );
  }

  async getIamAuth(): Promise<SqlIamAuth> {
    const provider = this.getOrCreateTokenProvider();
    const token = await provider.getToken();
    const { engine, user, host, port, database, ssl } = this.info;

    const url = buildConnectionUrl({ engine, user, password: token, host, port, database, ssl });

    let readUrl: string | undefined;
    if (this.info.readHost) {
      const readProvider = this.getOrCreateReadTokenProvider();
      const readToken = await readProvider.getToken();
      readUrl = buildConnectionUrl({
        engine,
        user,
        password: readToken,
        host: this.info.readHost,
        port,
        database,
        ssl,
      });
    }

    return { token, url, ...(readUrl ? { readUrl } : {}) };
  }

  private getOrCreateTokenProvider(): TokenProvider {
    if (!this.tokenProvider) {
      this.tokenProvider = this.factory(this.info.host, this.info.port, this.info.user);
    }
    return this.tokenProvider;
  }

  private getOrCreateReadTokenProvider(): TokenProvider {
    if (!this.readTokenProvider) {
      this.readTokenProvider = this.factory(this.info.readHost!, this.info.port, this.info.user);
    }
    return this.readTokenProvider;
  }
}
