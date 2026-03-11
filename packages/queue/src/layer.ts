import createDebug from "debug";
import type { CelerityLayer, BaseHandlerContext, CelerityTracer } from "@celerity-sdk/types";
import { TRACER_TOKEN, CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import { createQueueClient } from "./factory";
import { queueToken, DEFAULT_QUEUE_TOKEN } from "./decorators";

const debug = createDebug("celerity:queue");

/**
 * System layer that auto-registers {@link QueueClient} and per-resource
 * {@link Queue} handles in the DI container.
 *
 * Reads resource link topology from `CELERITY_RESOURCE_LINKS` and resolves
 * actual queue URLs / stream names from the ConfigService "resources" namespace.
 * Must run after ConfigLayer in the layer pipeline.
 */
export class QueueLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      const tracer = context.container.has(TRACER_TOKEN)
        ? await context.container.resolve<CelerityTracer>(TRACER_TOKEN)
        : undefined;

      const client = createQueueClient({ tracer });
      debug("registering QueueClient");
      context.container.register("QueueClient", { useValue: client });

      const links = captureResourceLinks();
      const queueLinks = getLinksOfType(links, "queue");

      if (queueLinks.size > 0) {
        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);

        for (const [resourceName, configKey] of queueLinks) {
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered queue resource %s → %s", resourceName, actualName);
          context.container.register(queueToken(resourceName), {
            useValue: client.queue(actualName),
          });
        }

        if (queueLinks.size === 1) {
          const [, configKey] = [...queueLinks.entries()][0];
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered default queue → %s", actualName);
          context.container.register(DEFAULT_QUEUE_TOKEN, {
            useValue: client.queue(actualName),
          });
        }
      }

      this.initialized = true;
    }

    return next();
  }
}
