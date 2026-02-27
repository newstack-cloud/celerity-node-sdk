export class BucketError extends Error {
  constructor(
    message: string,
    public readonly bucket: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BucketError";
  }
}
