import type { Knex } from "knex";
import type { ServiceContainer } from "@celerity-sdk/types";
import type { SqlDatabaseCredentials } from "./types";
import {
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
} from "./decorators";

/**
 * Resolves the writer {@link Knex} instance from the DI container.
 * For function-based handlers where parameter decorators aren't available.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit for default.
 */
export function getSqlWriter(container: ServiceContainer, resourceName?: string): Promise<Knex> {
  const token = resourceName ? sqlWriterToken(resourceName) : DEFAULT_SQL_WRITER_TOKEN;
  return container.resolve<Knex>(token);
}

/**
 * Resolves the reader {@link Knex} instance from the DI container.
 * Falls back to the writer when no read replica is configured.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit for default.
 */
export function getSqlReader(container: ServiceContainer, resourceName?: string): Promise<Knex> {
  const token = resourceName ? sqlReaderToken(resourceName) : DEFAULT_SQL_READER_TOKEN;
  return container.resolve<Knex>(token);
}

/**
 * Resolves {@link SqlDatabaseCredentials} from the DI container for BYO ORM.
 *
 * @param container - The service container (typically `context.container`).
 * @param resourceName - The blueprint resource name. Omit for default.
 */
export function getSqlCredentials(
  container: ServiceContainer,
  resourceName?: string,
): Promise<SqlDatabaseCredentials> {
  const token = resourceName
    ? sqlDatabaseCredentialsToken(resourceName)
    : DEFAULT_SQL_CREDENTIALS_TOKEN;
  return container.resolve<SqlDatabaseCredentials>(token);
}
