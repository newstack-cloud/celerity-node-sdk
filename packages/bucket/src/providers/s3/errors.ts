/**
 * Checks if an error is an S3 "not found" error.
 * S3 throws `NoSuchKey` for GetObject and `NotFound` for HeadObject.
 */
export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const name = (error as { name?: string }).name;
  if (name === "NoSuchKey" || name === "NotFound") return true;

  const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return statusCode === 404;
}
