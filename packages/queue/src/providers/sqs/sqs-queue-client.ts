import { SQSClient } from "@aws-sdk/client-sqs";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { QueueClient, Queue } from "../../types";
import { SQSQueue } from "./sqs-queue";
import type { SQSQueueConfig } from "./types";
import { captureSQSConfig } from "./config";

export class SQSQueueClient implements QueueClient {
  private client: SQSClient | null = null;
  private readonly config: SQSQueueConfig;

  constructor(
    config?: SQSQueueConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureSQSConfig();
  }

  queue(name: string): Queue {
    return new SQSQueue(name, this.getClient(), this.tracer);
  }

  close(): void {
    this.client?.destroy();
    this.client = null;
  }

  private getClient(): SQSClient {
    if (!this.client) {
      this.client = new SQSClient({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: this.config.credentials,
      });
    }
    return this.client;
  }
}
