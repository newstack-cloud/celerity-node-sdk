export type S3ObjectStorageConfig = {
  /** AWS region for the S3 client. */
  region?: string;
  /** Override endpoint for S3-compatible services (LocalStack, MinIO). */
  endpoint?: string;
  /** Force path-style URLs (required for LocalStack/MinIO). */
  forcePathStyle?: boolean;
  /** AWS credentials override. Omit to use the default credential chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
};
