/**
 * Base error for cache operations. Wraps provider errors and includes
 * the cache resource name for context.
 */
export class CacheError extends Error {
  constructor(
    message: string,
    public readonly cache: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CacheError";
  }
}
