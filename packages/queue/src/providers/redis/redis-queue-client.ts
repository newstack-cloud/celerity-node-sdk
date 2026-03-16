import type { CelerityTracer } from "@celerity-sdk/types";
import type { QueueClient, Queue } from "../../types";
import { RedisQueue } from "./redis-queue";
import type { RedisQueueConfig } from "./types";
import { captureRedisConfig } from "./config";

export class RedisQueueClient implements QueueClient {
  private client: import("ioredis").default | null = null;
  private ioredisModule: typeof import("ioredis") | null = null;
  private readonly config: RedisQueueConfig;

  constructor(
    config?: RedisQueueConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureRedisConfig();
  }

  queue(name: string): Queue {
    const streamName = `celerity:queue:${name}`;
    return new RedisQueue(streamName, this.getClient(), this.tracer);
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
