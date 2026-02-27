import { Readable } from "node:stream";
import createDebug from "debug";
import {
  type S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import type {
  Bucket,
  GetOptions,
  GetObjectResult,
  PutObjectBody,
  PutOptions,
  PutObjectResult,
  ObjectInfo,
  CopyDestination,
  CopyOptions,
  CopyResult,
  SignUrlOptions,
  SignedUrl,
  ListOptions,
  ObjectListing,
} from "../../types";
import { BucketError } from "../../errors";
import { S3ObjectListing } from "./s3-object-listing";
import { isNotFoundError } from "./errors";

const debug = createDebug("celerity:bucket:s3");

export class S3Bucket implements Bucket {
  constructor(
    private readonly bucketName: string,
    private readonly client: S3Client,
    private readonly tracer?: CelerityTracer,
  ) {}

  async get(key: string, options?: GetOptions): Promise<GetObjectResult | null> {
    debug("get %s/%s", this.bucketName, key);
    return this.traced(
      "celerity.bucket.get",
      { "bucket.name": this.bucketName, "bucket.key": key },
      async (span) => {
        const range = options?.range;
        const rangeHeader = range ? `bytes=${range.start}-${range.end ?? ""}` : undefined;

        try {
          const response = await this.client.send(
            new GetObjectCommand({
              Bucket: this.bucketName,
              Key: key,
              Range: rangeHeader,
            }),
          );

          if (!response.Body) return null;

          // The AWS SDK v3 returns an IncomingMessage (extends Readable) in Node.js,
          // but the type is a union covering browser environments too.
          const body = response.Body;
          const data =
            body instanceof Readable ? body : Readable.fromWeb(body.transformToWebStream());

          return {
            data,
            metadata: {
              key,
              size: response.ContentLength ?? 0,
              contentType: response.ContentType,
              lastModified: response.LastModified ?? new Date(0),
              etag: response.ETag,
              metadata: response.Metadata,
            },
          };
        } catch (error) {
          if (isNotFoundError(error)) {
            span?.setAttribute("bucket.not_found", true);
            return null;
          }
          throw new BucketError(
            `Failed to get object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  async put(key: string, body: PutObjectBody, options?: PutOptions): Promise<PutObjectResult> {
    debug("put %s/%s", this.bucketName, key);
    return this.traced(
      "celerity.bucket.put",
      { "bucket.name": this.bucketName, "bucket.key": key },
      async () => {
        try {
          const response = await this.client.send(
            new PutObjectCommand({
              Bucket: this.bucketName,
              Key: key,
              Body: body,
              ContentType: options?.contentType,
              Metadata: options?.metadata,
            }),
          );

          return {
            etag: response.ETag,
            versionId: response.VersionId,
          };
        } catch (error) {
          throw new BucketError(
            `Failed to put object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  async delete(key: string): Promise<void> {
    debug("delete %s/%s", this.bucketName, key);
    return this.traced(
      "celerity.bucket.delete",
      { "bucket.name": this.bucketName, "bucket.key": key },
      async () => {
        try {
          await this.client.send(
            new DeleteObjectCommand({
              Bucket: this.bucketName,
              Key: key,
            }),
          );
        } catch (error) {
          throw new BucketError(
            `Failed to delete object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  async info(key: string): Promise<ObjectInfo | null> {
    debug("info %s/%s", this.bucketName, key);
    return this.traced(
      "celerity.bucket.info",
      { "bucket.name": this.bucketName, "bucket.key": key },
      async (span) => {
        try {
          const response = await this.client.send(
            new HeadObjectCommand({
              Bucket: this.bucketName,
              Key: key,
            }),
          );

          return {
            key,
            size: response.ContentLength ?? 0,
            contentType: response.ContentType,
            lastModified: response.LastModified ?? new Date(0),
            etag: response.ETag,
            metadata: response.Metadata,
          };
        } catch (error) {
          if (isNotFoundError(error)) {
            span?.setAttribute("bucket.not_found", true);
            return null;
          }
          throw new BucketError(
            `Failed to get info for object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  async exists(key: string): Promise<boolean> {
    debug("exists %s/%s", this.bucketName, key);
    return this.traced(
      "celerity.bucket.exists",
      { "bucket.name": this.bucketName, "bucket.key": key },
      async (span) => {
        try {
          await this.client.send(
            new HeadObjectCommand({
              Bucket: this.bucketName,
              Key: key,
            }),
          );
          return true;
        } catch (error) {
          if (isNotFoundError(error)) {
            span?.setAttribute("bucket.not_found", true);
            return false;
          }
          throw new BucketError(
            `Failed to check existence of object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  list(options?: ListOptions): ObjectListing {
    debug("list %s prefix=%s", this.bucketName, options?.prefix ?? "");
    return new S3ObjectListing(this.client, this.bucketName, options, this.tracer);
  }

  async copy(
    sourceKey: string,
    destination: CopyDestination,
    options?: CopyOptions,
  ): Promise<CopyResult> {
    const destBucket = typeof destination === "string" ? this.bucketName : destination.bucket;
    const destKey = typeof destination === "string" ? destination : destination.key;

    debug("copy %s/%s → %s/%s", this.bucketName, sourceKey, destBucket, destKey);
    return this.traced(
      "celerity.bucket.copy",
      {
        "bucket.name": this.bucketName,
        "bucket.source_key": sourceKey,
        "bucket.dest_key": destKey,
      },
      async () => {
        try {
          const hasOverrides =
            options?.metadata !== undefined || options?.contentType !== undefined;

          const response = await this.client.send(
            new CopyObjectCommand({
              CopySource: `${this.bucketName}/${sourceKey}`,
              Bucket: destBucket,
              Key: destKey,
              MetadataDirective: hasOverrides ? "REPLACE" : "COPY",
              ContentType: options?.contentType,
              Metadata: options?.metadata,
            }),
          );

          return {
            etag: response.CopyObjectResult?.ETag,
            versionId: response.VersionId,
          };
        } catch (error) {
          throw new BucketError(
            `Failed to copy object "${sourceKey}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  async signUrl(key: string, options: SignUrlOptions): Promise<SignedUrl> {
    debug("signUrl %s/%s %s", this.bucketName, key, options.action);
    return this.traced(
      "celerity.bucket.sign_url",
      {
        "bucket.name": this.bucketName,
        "bucket.key": key,
        "bucket.sign_operation": options.action,
      },
      async () => {
        try {
          const pkg = "@aws-sdk/s3-request-presigner";
          const { getSignedUrl } = await import(pkg);

          const command =
            options.action === "read"
              ? new GetObjectCommand({ Bucket: this.bucketName, Key: key })
              : new PutObjectCommand({
                  Bucket: this.bucketName,
                  Key: key,
                  ContentType: options.contentType,
                });

          const url = await getSignedUrl(this.client, command, {
            expiresIn: options.expiresIn,
          });

          return {
            url,
            expiresAt: new Date(Date.now() + options.expiresIn * 1000),
          };
        } catch (error) {
          throw new BucketError(
            `Failed to sign URL for object "${key}" in bucket "${this.bucketName}"`,
            this.bucketName,
            { cause: error },
          );
        }
      },
    );
  }

  private traced<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span?: CeleritySpan) => Promise<T>,
  ): Promise<T> {
    if (!this.tracer) return fn();
    return this.tracer.withSpan(name, (span) => fn(span), attributes);
  }
}
