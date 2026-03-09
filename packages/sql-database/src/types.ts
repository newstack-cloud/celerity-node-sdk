export type SqlEngine = "postgres" | "mysql";

export type SqlAuthMode = "password" | "iam";

export type DeployTarget = "functions" | "runtime";

export type PoolConfig = {
  min: number;
  max: number;
  idleTimeoutMillis: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  reapIntervalMillis: number;
};

export type SqlConnectionInfo = {
  host: string;
  readHost?: string;
  port: number;
  database: string;
  user: string;
  engine: SqlEngine;
  ssl: boolean;
  authMode: SqlAuthMode;
};

export type SqlPasswordAuth = {
  password: string;
  url: string;
  readUrl?: string;
};

export type SqlIamAuth = {
  token: string;
  url: string;
  readUrl?: string;
};

export interface SqlDatabaseCredentials {
  getConnectionInfo(): Promise<SqlConnectionInfo>;
  getPasswordAuth(): Promise<SqlPasswordAuth>;
  getIamAuth(): Promise<SqlIamAuth>;
}

export interface TokenProvider {
  getToken(): Promise<string>;
}

export type TokenProviderFactory = (
  hostname: string,
  port: number,
  username: string,
) => TokenProvider;
