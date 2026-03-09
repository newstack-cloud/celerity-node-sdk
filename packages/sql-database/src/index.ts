// Types
export type {
  SqlEngine,
  SqlAuthMode,
  DeployTarget,
  PoolConfig,
  SqlConnectionInfo,
  SqlPasswordAuth,
  SqlIamAuth,
  SqlDatabaseCredentials,
  TokenProvider,
  TokenProviderFactory,
} from "./types";

// Errors
export { SqlDatabaseError } from "./errors";

// Config
export {
  captureSqlDatabaseLayerConfig,
  POOL_PRESETS,
  resolvePoolOverrides,
  resolvePoolConfig,
} from "./config";
export type { SqlDatabaseLayerConfig } from "./config";

// Credentials
export { resolveDatabaseCredentials, buildConnectionUrl } from "./credentials";
export type { ConnectionUrlParams } from "./credentials";

// Token providers
export { RdsTokenProvider, createRdsTokenProviderFactory } from "./rds-token-provider";

// Factory
export { createKnexInstance } from "./factory";
export type { CreateKnexOptions } from "./factory";

// SqlDatabaseInstance
export { SqlDatabaseInstance } from "./sql-database";

// Decorators & tokens
export {
  SqlDatabase as SqlDatabaseDecorator,
  SqlWriter as SqlWriterDecorator,
  SqlReader as SqlReaderDecorator,
  SqlCredentials as SqlCredentialsDecorator,
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  sqlDatabaseInstanceToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
  DEFAULT_SQL_DATABASE_INSTANCE_TOKEN,
} from "./decorators";

// Helpers
export { getSqlWriter, getSqlReader, getSqlCredentials } from "./helpers";

// Layer
export { SqlDatabaseLayer } from "./layer";
