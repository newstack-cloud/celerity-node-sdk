import type { Readable } from "node:stream";
import type { Closeable } from "@celerity-sdk/types";

export const ObjectStorage = Symbol.for("ObjectStorage");

/**
 * An object storage abstraction for storing and retrieving files, blobs, or other binary data.
 * Provides access to named buckets, each representing a logical container for objects.
 */
export interface ObjectStorage extends Closeable {
  /**
   * Retrieves a bucket instance by its logical name. The returned bucket is a lightweight
   * handle — no network calls are made until an operation is invoked.
   *
   * @param name The name of the bucket.
   */
  bucket(name: string): Bucket;
}

/**
 * A bucket represents a logical container for objects in a storage system. It provides methods for
 * performing operations such as uploading, downloading, listing, and deleting objects within the bucket.
 */
export interface Bucket {
  /**
   * Retrieve an object from the bucket by its key. Returns `null` if the object does not exist.
   * The caller is responsible for consuming or destroying the returned readable stream
   * to avoid resource leaks.
   *
   * @param key The unique identifier for the object within the bucket.
   * @param options Optional parameters such as byte range for partial content retrieval.
   * @returns A promise that resolves to the object's data and metadata, or `null` if the object does not exist.
   */
  get(key: string, options?: GetOptions): Promise<GetObjectResult | null>;

  /**
   * Store an object in the bucket with the specified key and data. The body can be a readable
   * stream for large objects, a buffer for binary data, or a string for text data.
   *
   * @param key The unique identifier for the object within the bucket.
   * @param body The data to store in the object. This can be a readable stream, a buffer, or a string.
   * @param options Optional parameters for the put operation, such as content type and metadata.
   * @returns A promise that resolves to the result of the put operation, including the ETag and version ID if applicable.
   */
  put(key: string, body: PutObjectBody, options?: PutOptions): Promise<PutObjectResult>;

  /**
   * Delete an object from the bucket by its key.
   * This operation is idempotent — deleting a non-existent key does not throw.
   *
   * @param key The unique identifier for the object to delete.
   */
  delete(key: string): Promise<void>;

  /**
   * Retrieve metadata about an object in the bucket without fetching the actual data.
   * Returns `null` if the object does not exist.
   *
   * @param key The unique identifier for the object within the bucket.
   * @returns A promise that resolves to the metadata information of the object, or `null` if the object does not exist.
   */
  info(key: string): Promise<ObjectInfo | null>;

  /**
   * Check whether an object exists in the bucket.
   *
   * @param key The unique identifier for the object within the bucket.
   * @returns A promise that resolves to `true` if the object exists, `false` otherwise.
   */
  exists(key: string): Promise<boolean>;

  /**
   * List objects in the bucket. Returns an {@link ObjectListing} that handles pagination
   * transparently, allowing the caller to iterate over all matching objects without managing
   * page tokens. The listing exposes a cursor token that can be used to resume iteration
   * from the current position in a subsequent call.
   *
   * @param options Optional filters such as key prefix and cursor for resuming a previous listing.
   * @returns An object listing that yields metadata for each object and exposes a cursor for resuming.
   */
  list(options?: ListOptions): ObjectListing;

  /**
   * Copy an object within or across buckets using a server-side copy. No data is transferred
   * through the caller — the copy is performed entirely by the storage provider.
   *
   * @param sourceKey The key of the source object in this bucket.
   * @param destination The destination key for a same-bucket copy, or a full reference for cross-bucket copies.
   * @param options Optional parameters such as content type and metadata overrides for the destination object.
   * @returns A promise that resolves to the result of the copy operation, including the ETag and version ID if applicable.
   */
  copy(sourceKey: string, destination: CopyDestination, options?: CopyOptions): Promise<CopyResult>;

  /**
   * Generate a pre-signed URL for direct client access to an object. Supports both read (download)
   * and write (single-request upload) actions, allowing frontends to interact with object storage
   * without proxying data through the application server.
   *
   * @param key The object key to generate a signed URL for.
   * @param options The action, expiry duration, and optional content constraints for the signed URL.
   * @returns A promise that resolves to the signed URL and its expiration time.
   */
  signUrl(key: string, options: SignUrlOptions): Promise<SignedUrl>;
}

/**
 * The body of an object to be stored in the bucket. This can be a readable stream for large
 * objects, a buffer for binary data, or a string for text data.
 */
export type PutObjectBody = Readable | Buffer | string;

/**
 * Metadata information about an object stored in a bucket. This includes details such as the
 * object's size, content type, last modified date, and any user-defined metadata fields.
 */
export type ObjectInfo = {
  /**
   * The unique identifier for the object within the bucket. This key is used to reference
   * and access the object in storage operations.
   */
  key: string;
  /**
   * The size of the object in bytes. This indicates how much storage space the object occupies.
   */
  size: number;
  /**
   * The MIME type of the object's content. This helps identify the format of the data
   * (e.g., "image/png", "application/json"). May be undefined if the content type was not
   * set when the object was stored.
   */
  contentType?: string;
  /**
   * The date and time when the object was last modified.
   */
  lastModified: Date;
  /**
   * An entity tag that uniquely identifies the content of the object. Typically a hash
   * of the object's content, used for conditional operations and cache validation.
   * ETag format is provider-specific and should not be compared across providers.
   */
  etag?: string;
  /**
   * User-defined metadata key-value pairs stored alongside the object. These are set during
   * upload and returned with object metadata operations.
   */
  metadata?: Record<string, string>;
};

/**
 * Options for retrieving an object from the bucket. Allows partial content retrieval
 * via byte range requests.
 */
export type GetOptions = {
  /**
   * A byte range for partial content retrieval. When specified, only the requested
   * range of bytes is returned in the response stream.
   */
  range?: ByteRange;
};

/**
 * A byte range for partial content retrieval, specifying the start and optional end
 * positions within an object.
 */
export type ByteRange = {
  /**
   * The zero-based inclusive start byte position.
   */
  start: number;
  /**
   * The zero-based inclusive end byte position. Omit to read from the start position
   * to the end of the object.
   */
  end?: number;
};

/**
 * The result of a get operation, containing the object's data as a readable stream
 * and its associated metadata.
 */
export type GetObjectResult = {
  /**
   * A readable stream containing the object's data. This allows for efficient retrieval
   * of large objects without loading them entirely into memory.
   */
  data: Readable;
  /**
   * Metadata information about the retrieved object, such as its size, content type,
   * last modified date, and any user-defined metadata fields.
   */
  metadata: ObjectInfo;
};

/**
 * Options for the put operation when storing an object in the bucket. This includes
 * parameters such as content type and user-defined metadata.
 */
export type PutOptions = {
  /**
   * The MIME type of the content being stored. Providers may auto-detect the content type
   * if this is omitted.
   */
  contentType?: string;
  /**
   * User-defined metadata key-value pairs to store alongside the object. These can be
   * retrieved later with object metadata operations.
   */
  metadata?: Record<string, string>;
};

/**
 * The result of a put operation when storing an object in the bucket. This includes
 * information returned by the storage provider after successfully storing the object.
 */
export type PutObjectResult = {
  /**
   * The entity tag of the stored object, typically a hash of the object's content.
   */
  etag?: string;
  /**
   * The version ID of the stored object if the bucket has versioning enabled.
   */
  versionId?: string;
};

/**
 * An async iterable of object metadata that also exposes a cursor token for resuming
 * iteration from the current position. The cursor is updated as objects are yielded
 * and encodes enough state to resume from the exact position across all providers.
 */
export interface ObjectListing extends AsyncIterable<ObjectInfo> {
  /**
   * A cursor token representing the current position in the listing. This token can be
   * passed to a subsequent {@link Bucket.list} call via {@link ListOptions.cursor} to resume
   * iteration from this position. The value is `undefined` before iteration begins or after
   * all objects have been yielded.
   */
  readonly cursor: string | undefined;
}

/**
 * Options for listing objects in the bucket. Supports filtering by key prefix
 * and resuming a previous listing via an opaque cursor token.
 */
export type ListOptions = {
  /**
   * Only list objects whose keys start with this prefix. Useful for organizing
   * objects into logical groups or directories.
   */
  prefix?: string;
  /**
   * The maximum number of objects to return per internal page fetch. The listing handles
   * pagination transparently, but this controls the page size of each underlying request
   * to the storage provider.
   */
  maxResults?: number;
  /**
   * An opaque cursor token from a previous {@link ObjectListing} to resume iteration from
   * where it left off. Obtain this from the {@link ObjectListing.cursor} property after
   * breaking out of a previous listing loop.
   */
  cursor?: string;
};

/**
 * A copy destination — either a simple string key for a same-bucket copy,
 * or a full reference including the bucket name for cross-bucket copies.
 */
export type CopyDestination = string | { bucket: string; key: string };

/**
 * Options for the copy operation. Allows overriding the content type and metadata
 * on the destination object.
 */
export type CopyOptions = {
  /**
   * Override the content type on the destination object. If omitted, the content type
   * is copied from the source object.
   */
  contentType?: string;
  /**
   * Replace the destination object's metadata entirely with these key-value pairs,
   * rather than copying the metadata from the source object.
   */
  metadata?: Record<string, string>;
};

/**
 * The result of a server-side copy operation, including information about the
 * newly created destination object.
 */
export type CopyResult = {
  /**
   * The entity tag of the copied object.
   */
  etag?: string;
  /**
   * The version ID of the copied object if the destination bucket has versioning enabled.
   */
  versionId?: string;
};

/**
 * Options for generating a pre-signed URL. Controls the action (read or write),
 * expiry duration, and optional content constraints for write URLs.
 */
export type SignUrlOptions = {
  /**
   * Whether the URL grants read (download) or write (upload) access to the object.
   */
  action: "read" | "write";
  /**
   * The time in seconds until the pre-signed URL expires.
   */
  expiresIn: number;
  /**
   * For write URLs, the expected content type for the upload. On providers that support it
   * (S3, GCS), this is signed into the URL and the upload will be rejected if the content type
   * does not match. On other providers (Azure), this is advisory only.
   */
  contentType?: string;
};

/**
 * A pre-signed URL with its expiration time. The URL can be shared with clients to allow
 * direct access to the object without requiring application server credentials.
 */
export type SignedUrl = {
  /**
   * The pre-signed URL that grants temporary access to the object.
   */
  url: string;
  /**
   * The date and time when the pre-signed URL expires and can no longer be used.
   */
  expiresAt: Date;
};
