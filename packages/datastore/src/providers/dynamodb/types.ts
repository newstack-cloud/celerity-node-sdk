export type DynamoDBDatastoreConfig = {
  /** AWS region for the DynamoDB client. */
  region?: string;
  /** Override endpoint for DynamoDB-compatible services (LocalStack). */
  endpoint?: string;
  /** AWS credentials override. Omit to use the default credential chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
};
