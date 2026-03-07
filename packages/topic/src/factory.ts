import { resolveConfig } from "@celerity-sdk/config";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { TopicClient } from "./types";
import type { SNSTopicConfig } from "./providers/sns/types";
import type { RedisTopicConfig } from "./providers/redis/types";

export type CreateTopicClientOptions = {
  /** Override provider selection. If omitted, derived from platform config. */
  provider?: "aws" | "local" | "gcp" | "azure";
  /** SNS-specific configuration overrides. */
  aws?: SNSTopicConfig;
  /** Redis-specific configuration overrides (local environment). */
  local?: RedisTopicConfig;
  /** Optional tracer for Celerity-level span instrumentation. */
  tracer?: CelerityTracer;
};

export async function createTopicClient(options?: CreateTopicClientOptions): Promise<TopicClient> {
  const resolved = resolveConfig("topic");
  const provider = options?.provider ?? resolved.provider;

  switch (provider) {
    case "aws": {
      const mod = "./providers/sns/sns-topic-client.js";
      const { SNSTopicClient } = await import(mod);
      return new SNSTopicClient(options?.aws, options?.tracer);
    }
    // Local environments always use Redis pub/sub regardless of deploy target.
    // The Celerity CLI manages the Redis instance and local-events sidecar.
    case "local": {
      const mod = "./providers/redis/redis-topic-client.js";
      const { RedisTopicClient } = await import(mod);
      return new RedisTopicClient(options?.local, options?.tracer);
    }
    // case "gcp":
    //   v1: Google Cloud Pub/Sub
    // case "azure":
    //   v1: Azure Service Bus Topics
    default:
      throw new Error(`Unsupported topic provider: "${provider}"`);
  }
}
