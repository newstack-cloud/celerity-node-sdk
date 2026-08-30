import type { DynamoDBDatastoreConfig } from "./types";

/**
 * Captures DynamoDB configuration from environment variables.
 * This is the only place that reads `process.env` for DynamoDB config.
 */
// Credentials are only taken from the environment when a custom endpoint is set, which
// means a local emulator. On real AWS they are left undefined so the SDK's own provider
// chain resolves them.
export function captureDynamoDBConfig(): DynamoDBDatastoreConfig {
  const endpoint = process.env.CELERITY_AWS_DYNAMODB_ENDPOINT ?? process.env.AWS_ENDPOINT_URL;
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    endpoint,
    credentials: endpoint
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
        }
      : undefined,
  };
}
