import { SNSClient } from "@aws-sdk/client-sns";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { TopicClient, Topic } from "../../types";
import { SNSTopic } from "./sns-topic";
import type { SNSTopicConfig } from "./types";
import { captureSNSConfig } from "./config";

export class SNSTopicClient implements TopicClient {
  private client: SNSClient | null = null;
  private readonly config: SNSTopicConfig;

  constructor(
    config?: SNSTopicConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureSNSConfig();
  }

  topic(name: string): Topic {
    return new SNSTopic(name, this.getClient(), this.tracer);
  }

  close(): void {
    this.client?.destroy();
    this.client = null;
  }

  private getClient(): SNSClient {
    if (!this.client) {
      this.client = new SNSClient({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: this.config.credentials,
      });
    }
    return this.client;
  }
}
