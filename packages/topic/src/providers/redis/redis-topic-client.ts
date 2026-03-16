import type { CelerityTracer } from "@celerity-sdk/types";
import type { TopicClient, Topic } from "../../types";
import { RedisTopic } from "./redis-topic";
import type { RedisTopicConfig } from "./types";
import { captureRedisConfig } from "./config";

export class RedisTopicClient implements TopicClient {
  private client: import("ioredis").default | null = null;
  private ioredisModule: typeof import("ioredis") | null = null;
  private readonly config: RedisTopicConfig;

  constructor(
    config?: RedisTopicConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureRedisConfig();
  }

  topic(name: string): Topic {
    const channel = `celerity:topic:channel:${name}`;
    return new RedisTopic(channel, this.getClient(), this.tracer);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async ensureIoRedis(): Promise<void> {
    if (!this.ioredisModule) {
      const pkg = "ioredis";
      this.ioredisModule = (await import(pkg)) as typeof import("ioredis");
    }
  }

  private getClient(): import("ioredis").default {
    if (!this.client) {
      const ioredis = this.ioredisModule!;
      const Redis = ioredis.default ?? ioredis;
      this.client = new Redis(this.config.url as string);
    }
    return this.client!;
  }
}
