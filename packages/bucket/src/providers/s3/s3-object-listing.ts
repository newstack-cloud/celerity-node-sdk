import createDebug from "debug";
import { type S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { ObjectInfo, ObjectListing, ListOptions } from "../../types";
import { BucketError } from "../../errors";

const debug = createDebug("celerity:bucket:s3");

type CursorState = {
  afterKey: string;
};

function encodeCursor(lastKey: string): string {
  const state: CursorState = { afterKey: lastKey };
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

function decodeCursor(cursor: string): CursorState {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as CursorState;
}

export class S3ObjectListing implements ObjectListing {
  private _cursor: string | undefined;

  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly options?: ListOptions,
    private readonly tracer?: CelerityTracer,
  ) {
    this._cursor = options?.cursor;
  }

  get cursor(): string | undefined {
    return this._cursor;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ObjectInfo> {
    const cursorState = this._cursor ? decodeCursor(this._cursor) : undefined;
    let continuationToken: string | undefined;
    let startAfter = cursorState?.afterKey;

    do {
      debug("list page %s token=%s", this.bucketName, continuationToken ?? "(start)");

      const response = await this.fetchPage(continuationToken, startAfter);

      for (const obj of response.Contents ?? []) {
        this._cursor = encodeCursor(obj.Key!);

        yield {
          key: obj.Key!,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(0),
          etag: obj.ETag,
        };
      }

      continuationToken = response.NextContinuationToken;
      startAfter = undefined;
    } while (continuationToken);

    this._cursor = undefined;
  }

  private async fetchPage(continuationToken?: string, startAfter?: string) {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: this.options?.prefix,
      MaxKeys: this.options?.maxResults,
      ContinuationToken: continuationToken,
      // StartAfter is only used on the first request when resuming from cursor.
      // On subsequent pages, ContinuationToken takes over.
      StartAfter: !continuationToken ? startAfter : undefined,
    });

    const doFetch = async () => {
      try {
        return await this.client.send(command);
      } catch (error) {
        throw new BucketError(
          `Failed to list objects in bucket "${this.bucketName}"`,
          this.bucketName,
          { cause: error },
        );
      }
    };

    if (!this.tracer) return doFetch();
    return this.tracer.withSpan("celerity.bucket.list_page", () => doFetch(), {
      "bucket.name": this.bucketName,
      "bucket.continuation_token": continuationToken ?? "",
    });
  }
}
