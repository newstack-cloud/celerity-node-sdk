import createDebug from "debug";
import type { CelerityLayer, BaseHandlerContext, CelerityTracer } from "@celerity-sdk/types";
import { TRACER_TOKEN, CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import { createDatastoreClient } from "./factory";
import { datastoreToken, DEFAULT_DATASTORE_TOKEN } from "./decorators";

const debug = createDebug("celerity:datastore");

/**
 * System layer that auto-registers {@link DatastoreClient} and per-resource
 * {@link Datastore} handles in the DI container.
 *
 * Reads resource link topology from `CELERITY_RESOURCE_LINKS` and resolves
 * actual table/collection names from the ConfigService "resources" namespace.
 * Must run after ConfigLayer in the layer pipeline.
 */
type DatastoreLayerConfig = {
  deployTarget: string | undefined;
};

function captureDatastoreLayerConfig(): DatastoreLayerConfig {
  return {
    deployTarget: process.env.CELERITY_DEPLOY_TARGET,
  };
}

export class DatastoreLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;
  private config: DatastoreLayerConfig | null = null;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      this.config = captureDatastoreLayerConfig();

      const tracer = context.container.has(TRACER_TOKEN)
        ? await context.container.resolve<CelerityTracer>(TRACER_TOKEN)
        : undefined;

      const client = createDatastoreClient({
        tracer,
        deployTarget: this.config.deployTarget,
      });
      debug("registering DatastoreClient");
      context.container.register("DatastoreClient", { useValue: client });

      const links = captureResourceLinks();
      const datastoreLinks = getLinksOfType(links, "datastore");

      if (datastoreLinks.size > 0) {
        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);

        for (const [resourceName, configKey] of datastoreLinks) {
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered datastore resource %s → %s", resourceName, actualName);
          context.container.register(datastoreToken(resourceName), {
            useValue: client.datastore(actualName),
          });
        }

        if (datastoreLinks.size === 1) {
          const [, configKey] = [...datastoreLinks.entries()][0];
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered default datastore → %s", actualName);
          context.container.register(DEFAULT_DATASTORE_TOKEN, {
            useValue: client.datastore(actualName),
          });
        }
      }

      this.initialized = true;
    }

    return next();
  }
}
