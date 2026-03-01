import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { DatastoreClient, Datastore } from "../../types";
import { DynamoDBDatastore } from "./dynamodb-datastore";
import type { DynamoDBDatastoreConfig } from "./types";
import { captureDynamoDBConfig } from "./config";

export class DynamoDBDatastoreClient implements DatastoreClient {
  private client: DynamoDBClient | null = null;
  private docClient: DynamoDBDocumentClient | null = null;
  private readonly config: DynamoDBDatastoreConfig;

  constructor(
    config?: DynamoDBDatastoreConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureDynamoDBConfig();
  }

  datastore(name: string): Datastore {
    return new DynamoDBDatastore(name, this.getDocClient(), this.tracer);
  }

  close(): void {
    this.docClient?.destroy();
    this.client?.destroy();
    this.docClient = null;
    this.client = null;
  }

  private getDocClient(): DynamoDBDocumentClient {
    if (!this.docClient) {
      this.client = new DynamoDBClient({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: this.config.credentials,
      });
      this.docClient = DynamoDBDocumentClient.from(this.client, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
    return this.docClient;
  }
}
