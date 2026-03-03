/**
 * Base error for queue operations. Wraps provider SDK errors and includes
 * the queue identifier for context.
 */
export class QueueError extends Error {
  constructor(
    message: string,
    public readonly queue: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "QueueError";
  }
}
