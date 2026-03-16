import type { DynamoDBDatastoreConfig } from "./types";

/**
 * Captures DynamoDB configuration from environment variables.
 * This is the only place that reads `process.env` for DynamoDB config.
 */
export function captureDynamoDBConfig(): DynamoDBDatastoreConfig {
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    endpoint: process.env.CELERITY_AWS_DYNAMODB_ENDPOINT ?? process.env.AWS_ENDPOINT_URL,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  };
}
