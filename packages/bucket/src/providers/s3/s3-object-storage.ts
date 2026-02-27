import { S3Client } from "@aws-sdk/client-s3";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { ObjectStorage, Bucket } from "../../types";
import { S3Bucket } from "./s3-bucket";
import type { S3ObjectStorageConfig } from "./types";
import { captureS3Config } from "./config";

export class S3ObjectStorage implements ObjectStorage {
  private client: S3Client | null = null;
  private readonly config: S3ObjectStorageConfig;

  constructor(
    config?: S3ObjectStorageConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config ?? captureS3Config();
  }

  bucket(name: string): Bucket {
    return new S3Bucket(name, this.getClient(), this.tracer);
  }

  close(): void {
    this.client?.destroy();
    this.client = null;
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle,
        credentials: this.config.credentials,
      });
    }
    return this.client;
  }
}
