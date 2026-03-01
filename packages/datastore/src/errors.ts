export class DatastoreError extends Error {
  constructor(
    message: string,
    public readonly table: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DatastoreError";
  }
}

export class ConditionalCheckFailedError extends DatastoreError {
  constructor(table: string, options?: { cause?: unknown }) {
    super(`Conditional check failed on table "${table}"`, table, options);
    this.name = "ConditionalCheckFailedError";
  }
}
