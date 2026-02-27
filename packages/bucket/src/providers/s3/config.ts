import type { S3ObjectStorageConfig } from "./types";

/**
 * Captures S3 configuration from environment variables.
 * This is the only place that reads `process.env` for S3 config.
 */
export function captureS3Config(): S3ObjectStorageConfig {
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: !!process.env.AWS_ENDPOINT_URL,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  };
}
