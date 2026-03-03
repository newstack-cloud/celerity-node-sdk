import type { SQSQueueConfig } from "./types";

/**
 * Captures SQS configuration from environment variables.
 * This is the only place that reads `process.env` for SQS config.
 */
export function captureSQSConfig(): SQSQueueConfig {
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  };
}
