/**
 * Checks if an error is a DynamoDB ConditionalCheckFailedException.
 */
export function isConditionalCheckFailedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as { name?: string }).name === "ConditionalCheckFailedException";
}
