import "reflect-metadata";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";

export function sqlWriterToken(resourceName: string): symbol {
  return Symbol.for(`celerity:sqlDatabase:writer:${resourceName}`);
}

export function sqlReaderToken(resourceName: string): symbol {
  return Symbol.for(`celerity:sqlDatabase:reader:${resourceName}`);
}

export function sqlDatabaseCredentialsToken(resourceName: string): symbol {
  return Symbol.for(`celerity:sqlDatabase:credentials:${resourceName}`);
}

export function sqlDatabaseInstanceToken(resourceName: string): symbol {
  return Symbol.for(`celerity:sqlDatabase:instance:${resourceName}`);
}

export const DEFAULT_SQL_WRITER_TOKEN = Symbol.for("celerity:sqlDatabase:writer:default");
export const DEFAULT_SQL_READER_TOKEN = Symbol.for("celerity:sqlDatabase:reader:default");
export const DEFAULT_SQL_CREDENTIALS_TOKEN = Symbol.for("celerity:sqlDatabase:credentials:default");
export const DEFAULT_SQL_DATABASE_INSTANCE_TOKEN = Symbol.for(
  "celerity:sqlDatabase:instance:default",
);

function createResourceDecorator(
  tokenFn: (name: string) => symbol,
  defaultToken: symbol,
): (resourceName?: string) => ParameterDecorator {
  return (resourceName?: string): ParameterDecorator => {
    return (target, _propertyKey, parameterIndex) => {
      const token = resourceName ? tokenFn(resourceName) : defaultToken;
      const existing: Map<number, unknown> =
        Reflect.getOwnMetadata(INJECT_METADATA, target) ?? new Map();
      existing.set(parameterIndex, token);
      Reflect.defineMetadata(INJECT_METADATA, existing, target);

      if (resourceName) {
        const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, target) ?? [];
        if (!resources.includes(resourceName)) {
          Reflect.defineMetadata(USE_RESOURCE_METADATA, [...resources, resourceName], target);
        }
      }
    };
  };
}

/**
 * Parameter decorator that injects the writer {@link Knex} instance for the
 * given SQL database resource. Alias for {@link SqlWriter}.
 *
 * @example
 * ```ts
 * constructor(@SqlDatabase("ordersDb") private db: Knex) {}
 * ```
 */
export const SqlDatabase = createResourceDecorator(sqlWriterToken, DEFAULT_SQL_WRITER_TOKEN);

/**
 * Parameter decorator that injects the writer {@link Knex} instance.
 * Explicit alternative to {@link SqlDatabase} when paired with {@link SqlReader}.
 */
export const SqlWriter = createResourceDecorator(sqlWriterToken, DEFAULT_SQL_WRITER_TOKEN);

/**
 * Parameter decorator that injects the reader {@link Knex} instance for the
 * given SQL database resource. Falls back to the writer when no read replica
 * is configured.
 */
export const SqlReader = createResourceDecorator(sqlReaderToken, DEFAULT_SQL_READER_TOKEN);

/**
 * Parameter decorator that injects {@link SqlDatabaseCredentials} for BYO ORM or SQL library.
 */
export const SqlCredentials = createResourceDecorator(
  sqlDatabaseCredentialsToken,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
);
