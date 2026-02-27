import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import type { CelerityTracer, CeleritySpan } from "@celerity-sdk/types";
import { S3Bucket } from "../../src/providers/s3/s3-bucket";
import { BucketError } from "../../src/errors";

// --- Mocks ---

function mockClient(overrides?: Partial<S3Client>): S3Client {
  return {
    send: vi.fn(),
    ...overrides,
  } as unknown as S3Client;
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

function mockTracer(): CelerityTracer & { withSpan: ReturnType<typeof vi.fn> } {
  const span = mockSpan();
  return {
    startSpan: vi.fn(() => span),
    withSpan: vi.fn(async (name, fn, _attrs) => fn(span)),
  };
}

// --- Tests ---

describe("S3Bucket", () => {
  let client: S3Client;
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = mockClient();
    sendMock = vi.mocked(client.send);
  });

  describe("error wrapping", () => {
    const sdkError = Object.assign(new Error("AccessDenied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });

    it("wraps get() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.get("key.txt")).rejects.toThrow(BucketError);
      try {
        await bucket.get("key.txt");
      } catch (error) {
        expect(error).toBeInstanceOf(BucketError);
        expect((error as BucketError).bucket).toBe("my-bucket");
        expect((error as BucketError).cause).toBe(sdkError);
        expect((error as BucketError).message).toContain("key.txt");
      }
    });

    it("wraps put() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.put("key.txt", "data")).rejects.toThrow(BucketError);
      try {
        await bucket.put("key.txt", "data");
      } catch (error) {
        expect((error as BucketError).bucket).toBe("my-bucket");
        expect((error as BucketError).cause).toBe(sdkError);
      }
    });

    it("wraps delete() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.delete("key.txt")).rejects.toThrow(BucketError);
    });

    it("wraps info() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.info("key.txt")).rejects.toThrow(BucketError);
    });

    it("wraps exists() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.exists("key.txt")).rejects.toThrow(BucketError);
    });

    it("wraps copy() errors in BucketError with cause", async () => {
      sendMock.mockRejectedValue(sdkError);
      const bucket = new S3Bucket("my-bucket", client);

      await expect(bucket.copy("src.txt", "dst.txt")).rejects.toThrow(BucketError);
    });

    it("returns null for NotFound on get()", async () => {
      const notFound = Object.assign(new Error("NoSuchKey"), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      });
      sendMock.mockRejectedValue(notFound);
      const bucket = new S3Bucket("my-bucket", client);

      const result = await bucket.get("missing.txt");
      expect(result).toBeNull();
    });

    it("returns null for NotFound on info()", async () => {
      const notFound = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      sendMock.mockRejectedValue(notFound);
      const bucket = new S3Bucket("my-bucket", client);

      const result = await bucket.info("missing.txt");
      expect(result).toBeNull();
    });

    it("returns false for NotFound on exists()", async () => {
      const notFound = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      sendMock.mockRejectedValue(notFound);
      const bucket = new S3Bucket("my-bucket", client);

      const result = await bucket.exists("missing.txt");
      expect(result).toBe(false);
    });
  });

  describe("tracer spans", () => {
    it("calls withSpan for get() with correct name and attributes", async () => {
      const body = Readable.from(["hello"]);
      sendMock.mockResolvedValue({
        Body: body,
        ContentLength: 5,
        LastModified: new Date(),
      });
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.get("file.txt");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.get",
        expect.any(Function),
        { "bucket.name": "my-bucket", "bucket.key": "file.txt" },
      );
    });

    it("calls withSpan for put() with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ ETag: '"abc"' });
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.put("file.txt", "data");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.put",
        expect.any(Function),
        { "bucket.name": "my-bucket", "bucket.key": "file.txt" },
      );
    });

    it("calls withSpan for delete() with correct name", async () => {
      sendMock.mockResolvedValue({});
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.delete("file.txt");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.delete",
        expect.any(Function),
        { "bucket.name": "my-bucket", "bucket.key": "file.txt" },
      );
    });

    it("calls withSpan for info() with correct name", async () => {
      sendMock.mockResolvedValue({
        ContentLength: 100,
        LastModified: new Date(),
      });
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.info("file.txt");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.info",
        expect.any(Function),
        { "bucket.name": "my-bucket", "bucket.key": "file.txt" },
      );
    });

    it("calls withSpan for exists() with correct name", async () => {
      sendMock.mockResolvedValue({});
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.exists("file.txt");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.exists",
        expect.any(Function),
        { "bucket.name": "my-bucket", "bucket.key": "file.txt" },
      );
    });

    it("calls withSpan for copy() with correct name and attributes", async () => {
      sendMock.mockResolvedValue({ CopyObjectResult: { ETag: '"abc"' } });
      const tracer = mockTracer();
      const bucket = new S3Bucket("my-bucket", client, tracer);

      await bucket.copy("src.txt", "dst.txt");

      expect(tracer.withSpan).toHaveBeenCalledWith(
        "celerity.bucket.copy",
        expect.any(Function),
        {
          "bucket.name": "my-bucket",
          "bucket.source_key": "src.txt",
          "bucket.dest_key": "dst.txt",
        },
      );
    });

    it("works without tracer (undefined tracer path)", async () => {
      const body = Readable.from(["hello"]);
      sendMock.mockResolvedValue({
        Body: body,
        ContentLength: 5,
        LastModified: new Date(),
      });
      const bucket = new S3Bucket("my-bucket", client);

      const result = await bucket.get("file.txt");
      expect(result).not.toBeNull();
    });
  });
});
