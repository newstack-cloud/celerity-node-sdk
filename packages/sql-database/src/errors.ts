export class SqlDatabaseError extends Error {
  constructor(
    message: string,
    public readonly database: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SqlDatabaseError";
  }
}
