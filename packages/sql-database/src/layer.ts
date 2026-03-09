import createDebug from "debug";
import type { CelerityLayer, BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import { CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  type ConfigNamespace,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import type { SqlDatabaseLayerConfig } from "./config";
import type { TokenProviderFactory } from "./types";
import {
  captureSqlDatabaseLayerConfig,
  resolvePoolOverrides,
  resolveTokenProviderFactory,
} from "./config";
import { resolveDatabaseCredentials } from "./credentials";
import { createKnexInstance } from "./factory";
import { SqlDatabaseInstance } from "./sql-database";
import {
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  sqlDatabaseInstanceToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
  DEFAULT_SQL_DATABASE_INSTANCE_TOKEN,
} from "./decorators";

const debug = createDebug("celerity:sql-database");

/**
 * System layer that auto-registers per-resource SQL database instances
 * in the DI container.
 *
 * Reads resource link topology from `CELERITY_RESOURCE_LINKS` and resolves
 * connection credentials + pool config from the ConfigService "resources"
 * namespace. Must run after ConfigLayer in the layer pipeline.
 */
export class SqlDatabaseLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;
  private config: SqlDatabaseLayerConfig | null = null;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      this.config = captureSqlDatabaseLayerConfig();

      const links = captureResourceLinks();
      const sqlLinks = getLinksOfType(links, "sqlDatabase");

      if (sqlLinks.size > 0) {
        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);
        const tokenProviderFactory = await resolveTokenProviderFactory(this.config.platform);

        for (const [resourceName, configKey] of sqlLinks) {
          await this.initializeResource(
            context.container,
            resourceName,
            configKey,
            resourceConfig,
            tokenProviderFactory,
          );
        }

        if (sqlLinks.size === 1) {
          const [resourceName] = [...sqlLinks.keys()];
          await this.registerDefaultTokens(context.container, resourceName);
        }
      }

      this.initialized = true;
    }

    return next();
  }

  private async initializeResource(
    container: ServiceContainer,
    resourceName: string,
    configKey: string,
    resourceConfig: ConfigNamespace,
    tokenProviderFactory: TokenProviderFactory | undefined,
  ): Promise<void> {
    debug("resolving sql database resource %s (configKey=%s)", resourceName, configKey);

    const credentials = await resolveDatabaseCredentials(
      configKey,
      resourceConfig,
      tokenProviderFactory,
    );
    const poolOverrides = await resolvePoolOverrides(configKey, resourceConfig);
    const info = await credentials.getConnectionInfo();

    const writerKnex = await createKnexInstance({
      credentials,
      deployTarget: this.config!.deployTarget,
      pool: poolOverrides,
    });

    let readerKnex = writerKnex;
    if (info.readHost) {
      readerKnex = await createKnexInstance({
        credentials,
        deployTarget: this.config!.deployTarget,
        pool: poolOverrides,
        useReadHost: true,
      });
    }

    const instance = new SqlDatabaseInstance(writerKnex, readerKnex);

    container.register(sqlDatabaseInstanceToken(resourceName), {
      useValue: instance,
      onClose: () => instance.close(),
    });
    container.register(sqlWriterToken(resourceName), { useValue: writerKnex });
    container.register(sqlReaderToken(resourceName), { useValue: readerKnex });
    container.register(sqlDatabaseCredentialsToken(resourceName), { useValue: credentials });

    debug("registered sql database resource %s", resourceName);
  }

  private async registerDefaultTokens(
    container: ServiceContainer,
    resourceName: string,
  ): Promise<void> {
    const instance = await container.resolve(sqlDatabaseInstanceToken(resourceName));
    const writer = await container.resolve(sqlWriterToken(resourceName));
    const reader = await container.resolve(sqlReaderToken(resourceName));
    const creds = await container.resolve(sqlDatabaseCredentialsToken(resourceName));

    container.register(DEFAULT_SQL_DATABASE_INSTANCE_TOKEN, { useValue: instance });
    container.register(DEFAULT_SQL_WRITER_TOKEN, { useValue: writer });
    container.register(DEFAULT_SQL_READER_TOKEN, { useValue: reader });
    container.register(DEFAULT_SQL_CREDENTIALS_TOKEN, { useValue: creds });

    debug("registered default sql database tokens → %s", resourceName);
  }
}
