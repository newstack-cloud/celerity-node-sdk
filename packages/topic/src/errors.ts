/**
 * Base error for topic operations. Wraps provider SDK errors and includes
 * the topic identifier for context.
 */
export class TopicError extends Error {
  constructor(
    message: string,
    public readonly topic: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TopicError";
  }
}
