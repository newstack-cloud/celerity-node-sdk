/**
 * Maps an AWS S3 (or MinIO) event name to a Celerity-standard bucket event type.
 * Handles both the subscription format (`s3:ObjectCreated:Put`) used by
 * MinIO/runtime and the notification format (`ObjectCreated:Put`) in S3 notification JSON.
 * Returns `undefined` for unrecognised event names.
 */
export function mapBucketEventType(cloudEventName: string): string | undefined {
  // Normalise: strip optional "s3:" prefix so both formats work
  const name = cloudEventName.startsWith("s3:") ? cloudEventName.slice(3) : cloudEventName;

  if (name.startsWith("ObjectCreated:") || name.startsWith("ObjectRestore:")) {
    return "created";
  }
  if (name.startsWith("ObjectRemoved:")) {
    return "deleted";
  }
  if (name.startsWith("ObjectTagging:") || name.startsWith("ObjectAcl:")) {
    return "metadataUpdated";
  }
  return undefined;
}

/**
 * Maps an AWS DynamoDB Streams event name to a Celerity-standard datastore event type.
 * Returns `undefined` for unrecognised event names.
 */
export function mapDatastoreEventType(cloudEventName: string): string | undefined {
  switch (cloudEventName) {
    case "INSERT":
      return "inserted";
    case "MODIFY":
      return "modified";
    case "REMOVE":
      return "removed";
    default:
      return undefined;
  }
}
