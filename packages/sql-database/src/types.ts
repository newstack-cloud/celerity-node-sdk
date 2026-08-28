import type { SecretResolver } from "@celerity-sdk/config";

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

/**
 * The platform-specific pieces credential resolution needs, supplied by the
 * layer so that resolution itself stays provider-agnostic.
 *
 * Both are optional: a database using password auth needs no token provider,
 * and one whose password is seeded as a literal needs no secret resolver. Where
 * config asks for something the corresponding piece is missing, resolution
 * fails naming the resource and the key rather than the missing dependency.
 */
export type SqlCredentialsOptions = {
  /** Mints short-lived IAM auth tokens. Required for `authMode: "iam"`. */
  tokenProviderFactory?: TokenProviderFactory;
  /** Reads credentials the resources namespace refers to by reference. */
  secrets?: SecretResolver;
};
