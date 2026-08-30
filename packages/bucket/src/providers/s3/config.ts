import type { S3ObjectStorageConfig } from "./types";

/**
 * Captures S3 configuration from environment variables.
 * This is the only place that reads `process.env` for S3 config.
 */
export function captureS3Config(): S3ObjectStorageConfig {
  // Prefer Celerity-specific bucket credentials (set by the CLI for local MinIO)
  // over the shared AWS credentials (which may point to DynamoDB Local).
  const accessKeyId = process.env.CELERITY_LOCAL_BUCKET_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.CELERITY_LOCAL_BUCKET_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.CELERITY_AWS_S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL;

  // Credentials are only taken from the environment when a custom endpoint is set, which
  // means MinIO or another local emulator. On real AWS they are left undefined so the
  // SDK's own provider chain resolves them.
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    endpoint,
    forcePathStyle: !!endpoint,
    credentials:
      endpoint && accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            ...(process.env.AWS_SESSION_TOKEN
              ? { sessionToken: process.env.AWS_SESSION_TOKEN }
              : {}),
          }
        : undefined,
  };
}
