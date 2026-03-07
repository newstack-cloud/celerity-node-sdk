export type SNSTopicConfig = {
  /** AWS region (e.g. "us-east-1"). */
  region?: string;
  /** Override endpoint URL for LocalStack or other SNS-compatible services. */
  endpoint?: string;
  /** Explicit AWS credentials. When omitted, the SDK's default credential chain is used. */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};
