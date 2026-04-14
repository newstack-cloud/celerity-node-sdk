import createDebug from "debug";
import type { CelerityLayer, BaseHandlerContext, CelerityTracer } from "@celerity-sdk/types";
import { TRACER_TOKEN, CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import { createObjectStorage } from "./factory";
import { bucketToken, DEFAULT_BUCKET_TOKEN } from "./decorators";

const debug = createDebug("celerity:bucket");

/**
 * System layer that auto-registers {@link ObjectStorage} and per-resource
 * {@link Bucket} handles in the DI container.
 *
 * Reads resource link topology from the Celerity CLI-generated resource
 * links file and resolves actual bucket names from the ConfigService
 * "resources" namespace. Must run after ConfigLayer in the layer pipeline.
 */
export class ObjectStorageLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      const tracer = context.container.has(TRACER_TOKEN)
        ? await context.container.resolve<CelerityTracer>(TRACER_TOKEN)
        : undefined;

      const storage = await createObjectStorage({ tracer });
      debug("registering ObjectStorage");
      context.container.register("ObjectStorage", { useValue: storage });

      const links = captureResourceLinks();
      const bucketLinks = getLinksOfType(links, "bucket");

      if (bucketLinks.size > 0) {
        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);

        for (const [resourceName, configKey] of bucketLinks) {
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered bucket resource %s → %s", resourceName, actualName);
          context.container.register(bucketToken(resourceName), {
            useValue: storage.bucket(actualName),
          });
        }

        if (bucketLinks.size === 1) {
          const [, configKey] = [...bucketLinks.entries()][0];
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered default bucket → %s", actualName);
          context.container.register(DEFAULT_BUCKET_TOKEN, {
            useValue: storage.bucket(actualName),
          });
        }
      }

      this.initialized = true;
    }

    return next();
  }
}
