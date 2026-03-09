import type { ConfigNamespace } from "@celerity-sdk/config";
import type {
  SqlAuthMode,
  SqlConnectionInfo,
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
  tokenProviderFactory?: TokenProviderFactory,
): Promise<SqlDatabaseCredentials> {
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
    const password = await resourceConfig.get(`${configKey}_password`);
    if (!password) {
      throw new SqlDatabaseError(
        `Missing required config key "${configKey}_password" for password auth`,
        configKey,
      );
    }
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
