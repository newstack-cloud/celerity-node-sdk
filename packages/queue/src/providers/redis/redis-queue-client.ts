import type { CelerityTracer } from "@celerity-sdk/types";
import type { QueueClient, Queue } from "../../types";
import { RedisQueue } from "./redis-queue";
import type { RedisQueueConfig } from "./types";
import { captureRedisConfig } from "./config";

export class RedisQueueClient implements QueueClient {
  private client: import("ioredis").default | null = null;
  private readonly config: RedisQueueConfig;

  constructor(
    config?: RedisQueueConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureRedisConfig();
  }

  queue(name: string): Queue {
    return new RedisQueue(name, this.getClient(), this.tracer);
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
