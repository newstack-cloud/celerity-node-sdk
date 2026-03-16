import { resolveConfig } from "@celerity-sdk/config";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { DatastoreClient } from "./types";
import type { DynamoDBDatastoreConfig } from "./providers/dynamodb/types";

export type CreateDatastoreClientOptions = {
  /** Override provider selection. If omitted, derived from platform config. */
  provider?: "aws" | "local" | "gcp" | "azure";
  /** Cloud deploy target for local environments (e.g. "aws", "gcloud", "azure"). */
  deployTarget?: string;
  /** DynamoDB-specific configuration overrides. */
  aws?: DynamoDBDatastoreConfig;
  /** Optional tracer for Celerity-level span instrumentation. */
  tracer?: CelerityTracer;
};

export async function createDatastoreClient(
  options?: CreateDatastoreClientOptions,
): Promise<DatastoreClient> {
  const resolved = resolveConfig("datastore");
  const provider = options?.provider ?? resolved.provider;

  switch (provider) {
    case "aws": {
      const { DynamoDBDatastoreClient } =
        await import("./providers/dynamodb/dynamodb-datastore-client.js");
      return new DynamoDBDatastoreClient(options?.aws, options?.tracer);
    }
    case "local":
      return createLocalClient(options);
    default:
      throw new Error(`Unsupported datastore provider: "${provider}"`);
  }
}

async function createLocalClient(options?: CreateDatastoreClientOptions): Promise<DatastoreClient> {
  const deployTarget = options?.deployTarget?.toLowerCase();

  switch (deployTarget) {
    case "aws":
    case "aws-serverless":
    case undefined: {
      // DynamoDB Local (v0 default when no deploy target is specified)
      const { captureDynamoDBConfig } = await import("./providers/dynamodb/config.js");
      const { DynamoDBDatastoreClient } =
        await import("./providers/dynamodb/dynamodb-datastore-client.js");
      const localConfig: DynamoDBDatastoreConfig = {
        ...captureDynamoDBConfig(),
        ...options?.aws,
      };
      return new DynamoDBDatastoreClient(localConfig, options?.tracer);
    }
    // case "gcloud":
    // case "gcloud-serverless":
    //   v1: Firestore emulator
    // case "azure":
    // case "azure-serverless":
    //   v1: Cosmos DB emulator
    default:
      throw new Error(
        `Unsupported local datastore deploy target: "${deployTarget}". Only AWS is supported in v0.`,
      );
  }
}
