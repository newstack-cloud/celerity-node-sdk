import type { SNSTopicConfig } from "./types";

/**
 * Captures SNS configuration from environment variables.
 * This is the only place that reads `process.env` for SNS config.
 *
 * Credentials are only taken from the environment when a custom endpoint is set, which
 * means a local emulator. On real AWS they are left undefined so the SDK's own provider
 * chain resolves them.
 */
export function captureSNSConfig(): SNSTopicConfig {
  const endpoint = process.env.CELERITY_AWS_SNS_ENDPOINT ?? process.env.AWS_ENDPOINT_URL;
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
