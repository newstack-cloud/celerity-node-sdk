import { resolveConfig } from "@celerity-sdk/config";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { ObjectStorage } from "./types";
import type { S3ObjectStorageConfig } from "./providers/s3/types";
import { captureS3Config } from "./providers/s3/config";

export type CreateObjectStorageOptions = {
  /** Override provider selection. If omitted, derived from platform config. */
  provider?: "aws" | "local" | "gcp" | "azure";
  /** S3-specific configuration overrides. */
  aws?: S3ObjectStorageConfig;
  /** Optional tracer for Celerity-level span instrumentation. */
  tracer?: CelerityTracer;
};

export async function createObjectStorage(
  options?: CreateObjectStorageOptions,
): Promise<ObjectStorage> {
  const resolved = resolveConfig("bucket");
  const provider = options?.provider ?? resolved.provider;

  switch (provider) {
    case "aws": {
      const mod = "./providers/s3/s3-object-storage.js";
      const { S3ObjectStorage } = await import(mod);
      return new S3ObjectStorage(options?.aws, options?.tracer);
    }
    // Local environments use MinIO (S3-compatible).
    // Capture env-based config, then layer on forcePathStyle + any explicit overrides.
    case "local": {
      const mod = "./providers/s3/s3-object-storage.js";
      const { S3ObjectStorage } = await import(mod);
      const localConfig: S3ObjectStorageConfig = {
        ...captureS3Config(),
        forcePathStyle: true,
        ...options?.aws,
      };
      return new S3ObjectStorage(localConfig, options?.tracer);
    }
    default:
      throw new Error(`Unsupported object storage provider: "${provider}"`);
  }
}
