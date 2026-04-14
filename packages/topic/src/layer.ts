import createDebug from "debug";
import type { CelerityLayer, BaseHandlerContext, CelerityTracer } from "@celerity-sdk/types";
import { TRACER_TOKEN, CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import { createTopicClient } from "./factory";
import { topicToken, DEFAULT_TOPIC_TOKEN } from "./decorators";

const debug = createDebug("celerity:topic");

/**
 * System layer that auto-registers {@link TopicClient} and per-resource
 * {@link Topic} handles in the DI container.
 *
 * Reads resource link topology from the Celerity CLI-generated resource
 * links file and resolves actual topic ARNs / channel names from the
 * ConfigService "resources" namespace. Must run after ConfigLayer in the
 * layer pipeline.
 */
export class TopicLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      const tracer = context.container.has(TRACER_TOKEN)
        ? await context.container.resolve<CelerityTracer>(TRACER_TOKEN)
        : undefined;

      const client = await createTopicClient({ tracer });
      debug("registering TopicClient");
      context.container.register("TopicClient", { useValue: client });

      const links = captureResourceLinks();
      const topicLinks = getLinksOfType(links, "topic");

      if (topicLinks.size > 0) {
        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);

        for (const [resourceName, configKey] of topicLinks) {
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered topic resource %s → %s", resourceName, actualName);
          context.container.register(topicToken(resourceName), {
            useValue: client.topic(actualName),
          });
        }

        if (topicLinks.size === 1) {
          const [, configKey] = [...topicLinks.entries()][0];
          const actualName = await resourceConfig.getOrThrow(configKey);
          debug("registered default topic → %s", actualName);
          context.container.register(DEFAULT_TOPIC_TOKEN, {
            useValue: client.topic(actualName),
          });
        }
      }

      this.initialized = true;
    }

    return next();
  }
}
