import type { CelerityTracer } from "@celerity-sdk/types";
import type { TopicClient, Topic } from "../../types";
import { RedisTopic } from "./redis-topic";
import type { RedisTopicConfig } from "./types";
import { captureRedisConfig } from "./config";

export class RedisTopicClient implements TopicClient {
  private client: import("ioredis").default | null = null;
  private readonly config: RedisTopicConfig;

  constructor(
    config?: RedisTopicConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureRedisConfig();
  }

  topic(name: string): Topic {
    return new RedisTopic(name, this.getClient(), this.tracer);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  private getClient(): import("ioredis").default {
    if (!this.client) {
      // Dynamic require to avoid bundling ioredis when not used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis").default ?? require("ioredis");
      this.client = new Redis(this.config.url);
    }
    return this.client!;
  }
}
