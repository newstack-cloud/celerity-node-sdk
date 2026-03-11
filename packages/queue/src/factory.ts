import { resolveConfig } from "@celerity-sdk/config";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { QueueClient } from "./types";
import type { SQSQueueConfig } from "./providers/sqs/types";
import type { RedisQueueConfig } from "./providers/redis/types";
import { SQSQueueClient } from "./providers/sqs/sqs-queue-client";
import { RedisQueueClient } from "./providers/redis/redis-queue-client";

export type CreateQueueClientOptions = {
  /** Override provider selection. If omitted, derived from platform config. */
  provider?: "aws" | "local" | "gcp" | "azure";
  /** SQS-specific configuration overrides. */
  aws?: SQSQueueConfig;
  /** Redis-specific configuration overrides (local environment). */
  local?: RedisQueueConfig;
  /** Optional tracer for Celerity-level span instrumentation. */
  tracer?: CelerityTracer;
};

export function createQueueClient(options?: CreateQueueClientOptions): QueueClient {
  const resolved = resolveConfig("queue");
  const provider = options?.provider ?? resolved.provider;

  switch (provider) {
    case "aws":
      return new SQSQueueClient(options?.aws, options?.tracer);
    // Local environments always use Redis streams regardless of deploy target.
    // The Celerity CLI manages the Redis instance and local-events sidecar.
    case "local":
      return new RedisQueueClient(options?.local, options?.tracer);
    // case "gcp":
    //   v1: Google Cloud Pub/Sub
    // case "azure":
    //   v1: Azure Service Bus
    default:
      throw new Error(`Unsupported queue provider: "${provider}"`);
  }
}
