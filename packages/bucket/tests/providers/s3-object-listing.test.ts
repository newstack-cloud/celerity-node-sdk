import { describe, it, expect, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { S3ObjectListing } from "../../src/providers/s3/s3-object-listing";
import { BucketError } from "../../src/errors";

function mockClient(): S3Client {
  return { send: vi.fn() } as unknown as S3Client;
}

function mockSpan(): CeleritySpan {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    recordError: vi.fn(),
    setOk: vi.fn(),
    end: vi.fn(),
  };
}

function mockTracer(): CelerityTracer {
  const span = mockSpan();
  return {
    startSpan: vi.fn(() => span),
    withSpan: vi.fn(async (_name, fn, _attrs) => fn(span)),
  };
}

describe("S3ObjectListing", () => {
  it("wraps SDK errors in BucketError", async () => {
    const client = mockClient();
    (client.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("throttled"));

    const listing = new S3ObjectListing(client, "my-bucket");
    const items = [];
    try {
      for await (const item of listing) {
        items.push(item);
      }
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BucketError);
      expect((error as BucketError).bucket).toBe("my-bucket");
      expect((error as BucketError).cause).toBeInstanceOf(Error);
    }
  });

  it("calls withSpan per page when tracer is provided", async () => {
    const client = mockClient();
    (client.send as ReturnType<typeof vi.fn>).mockResolvedValue({
      Contents: [
        { Key: "a.txt", Size: 10, LastModified: new Date() },
      ],
      NextContinuationToken: undefined,
    });

    const tracer = mockTracer();
    const listing = new S3ObjectListing(client, "my-bucket", undefined, tracer);
    const items = [];
    for await (const item of listing) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
    expect(tracer.withSpan).toHaveBeenCalledWith(
      "celerity.bucket.list_page",
      expect.any(Function),
      { "bucket.name": "my-bucket", "bucket.continuation_token": "" },
    );
  });

  it("works without tracer", async () => {
    const client = mockClient();
    (client.send as ReturnType<typeof vi.fn>).mockResolvedValue({
      Contents: [
        { Key: "a.txt", Size: 10, LastModified: new Date() },
      ],
      NextContinuationToken: undefined,
    });

    const listing = new S3ObjectListing(client, "my-bucket");
    const items = [];
    for await (const item of listing) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
  });
});
