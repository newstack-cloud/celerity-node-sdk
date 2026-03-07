import type { SNSTopicConfig } from "./types";

/**
 * Captures SNS configuration from environment variables.
 * This is the only place that reads `process.env` for SNS config.
 */
export function captureSNSConfig(): SNSTopicConfig {
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
