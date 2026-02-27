import type { Readable } from "node:stream";
import { describe, it, expect, afterAll } from "vitest";
import { S3ObjectStorage } from "../../src/providers/s3/s3-object-storage";
import type { ObjectInfo } from "../../src/types";

const storage = new S3ObjectStorage({
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const bucket = storage.bucket("test-bucket");

afterAll(() => {
  storage.close();
});

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("S3 Provider (integration)", () => {
  describe("get", () => {
    it("should retrieve an existing object with correct data and metadata", async () => {
      const result = await bucket.get("hello.txt");
      expect(result).not.toBeNull();

      const text = await streamToString(result!.data);
      expect(text).toBe("Hello, World!");
      expect(result!.metadata.key).toBe("hello.txt");
      expect(result!.metadata.size).toBe(13);
      expect(result!.metadata.contentType).toBe("text/plain");
      expect(result!.metadata.lastModified).toBeInstanceOf(Date);
      expect(result!.metadata.etag).toBeDefined();
      expect(result!.metadata.metadata?.author).toBe("test");
      expect(result!.metadata.metadata?.version).toBe("1");
    });

    it("should return null for a non-existent key", async () => {
      const result = await bucket.get("does-not-exist.txt");
      expect(result).toBeNull();
    });

    it("should support range reads", async () => {
      const result = await bucket.get("range-test.bin", {
        range: { start: 0, end: 9 },
      });

      expect(result).not.toBeNull();
      const buf = await streamToBuffer(result!.data);
      expect(buf.length).toBe(10);
      expect(buf.every((b) => b === 0xab)).toBe(true);
    });

    it("should support range reads with only a start position", async () => {
      const result = await bucket.get("range-test.bin", {
        range: { start: 1020 },
      });

      expect(result).not.toBeNull();
      const buf = await streamToBuffer(result!.data);
      expect(buf.length).toBe(4);
    });
  });

  describe("put", () => {
    it("should store a string body and read it back", async () => {
      const result = await bucket.put("put-test-string.txt", "test content", {
        contentType: "text/plain",
      });
      expect(result.etag).toBeDefined();

      const readBack = await bucket.get("put-test-string.txt");
      expect(readBack).not.toBeNull();
      expect(await streamToString(readBack!.data)).toBe("test content");
    });

    it("should store a Buffer body and read it back", async () => {
      const buf = Buffer.from("buffer content");
      await bucket.put("put-test-buffer.bin", buf, {
        contentType: "application/octet-stream",
      });

      const readBack = await bucket.get("put-test-buffer.bin");
      expect(readBack).not.toBeNull();
      expect(await streamToBuffer(readBack!.data)).toEqual(buf);
    });

    it("should round-trip content type", async () => {
      await bucket.put("put-test-ct.json", '{"key":"value"}', {
        contentType: "application/json",
      });

      const info = await bucket.info("put-test-ct.json");
      expect(info?.contentType).toBe("application/json");
    });

    it("should round-trip custom metadata", async () => {
      await bucket.put("put-test-meta.txt", "meta test", {
        metadata: { env: "test", version: "42" },
      });

      const info = await bucket.info("put-test-meta.txt");
      expect(info?.metadata?.env).toBe("test");
      expect(info?.metadata?.version).toBe("42");
    });
  });

  describe("delete", () => {
    it("should delete an existing object", async () => {
      await bucket.put("delete-me.txt", "goodbye");
      expect(await bucket.exists("delete-me.txt")).toBe(true);

      await bucket.delete("delete-me.txt");
      expect(await bucket.exists("delete-me.txt")).toBe(false);
    });

    it("should not throw when deleting a non-existent key", async () => {
      await expect(bucket.delete("never-existed.txt")).resolves.toBeUndefined();
    });
  });

  describe("info", () => {
    it("should return metadata for an existing object", async () => {
      const info = await bucket.info("hello.txt");
      expect(info).not.toBeNull();
      expect(info!.key).toBe("hello.txt");
      expect(info!.size).toBe(13);
      expect(info!.contentType).toBe("text/plain");
      expect(info!.lastModified).toBeInstanceOf(Date);
      expect(info!.etag).toBeDefined();
      expect(info!.metadata?.author).toBe("test");
    });

    it("should return null for a non-existent key", async () => {
      const info = await bucket.info("nope.txt");
      expect(info).toBeNull();
    });
  });

  describe("exists", () => {
    it("should return true for an existing object", async () => {
      expect(await bucket.exists("hello.txt")).toBe(true);
    });

    it("should return false for a non-existent key", async () => {
      expect(await bucket.exists("nope.txt")).toBe(false);
    });
  });

  describe("list", () => {
    it("should iterate over all objects with a prefix", async () => {
      const items: ObjectInfo[] = [];
      for await (const item of bucket.list({ prefix: "list-test/" })) {
        items.push(item);
      }
      expect(items).toHaveLength(15);
      expect(items[0].key).toBe("list-test/item-000.txt");
      expect(items[14].key).toBe("list-test/item-014.txt");
    });

    it("should paginate with small maxResults and still yield all items", async () => {
      const items: ObjectInfo[] = [];
      for await (const item of bucket.list({ prefix: "list-test/", maxResults: 3 })) {
        items.push(item);
      }
      expect(items).toHaveLength(15);
    });

    it("should support cursor-based resume", async () => {
      const listing = bucket.list({ prefix: "list-test/", maxResults: 5 });
      const firstBatch: ObjectInfo[] = [];
      let count = 0;
      for await (const item of listing) {
        firstBatch.push(item);
        count++;
        if (count === 7) break;
      }
      expect(firstBatch).toHaveLength(7);
      expect(listing.cursor).toBeDefined();

      // Resume from cursor
      const remaining: ObjectInfo[] = [];
      for await (const item of bucket.list({ prefix: "list-test/", cursor: listing.cursor })) {
        remaining.push(item);
      }
      expect(remaining).toHaveLength(8);

      // Verify no overlap
      const allKeys = [...firstBatch.map((i) => i.key), ...remaining.map((i) => i.key)];
      expect(new Set(allKeys).size).toBe(15);
    });

    it("should return empty for a non-matching prefix", async () => {
      const items: ObjectInfo[] = [];
      for await (const item of bucket.list({ prefix: "no-such-prefix/" })) {
        items.push(item);
      }
      expect(items).toHaveLength(0);
    });

    it("should have undefined cursor after complete iteration", async () => {
      const listing = bucket.list({ prefix: "list-test/" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of listing) {
        // consume all
      }
      expect(listing.cursor).toBeUndefined();
    });
  });

  describe("copy", () => {
    it("should copy within the same bucket", async () => {
      await bucket.put("copy-source.txt", "copy me");
      const result = await bucket.copy("copy-source.txt", "copy-dest.txt");
      expect(result.etag).toBeDefined();

      const copied = await bucket.get("copy-dest.txt");
      expect(copied).not.toBeNull();
      expect(await streamToString(copied!.data)).toBe("copy me");
    });

    it("should copy to a different bucket", async () => {
      await bucket.put("cross-copy-source.txt", "cross bucket");
      const result = await bucket.copy("cross-copy-source.txt", {
        bucket: "copy-dest-bucket",
        key: "received.txt",
      });
      expect(result.etag).toBeDefined();

      const destBucket = storage.bucket("copy-dest-bucket");
      const copied = await destBucket.get("received.txt");
      expect(copied).not.toBeNull();
      expect(await streamToString(copied!.data)).toBe("cross bucket");
    });

    it("should override metadata on copy when provided", async () => {
      await bucket.put("meta-copy-src.txt", "meta", {
        metadata: { original: "true" },
      });
      await bucket.copy("meta-copy-src.txt", "meta-copy-dst.txt", {
        metadata: { replaced: "yes" },
      });

      const info = await bucket.info("meta-copy-dst.txt");
      expect(info?.metadata?.replaced).toBe("yes");
      expect(info?.metadata?.original).toBeUndefined();
    });
  });

  describe("signUrl", () => {
    it("should generate a read URL that can be fetched", async () => {
      await bucket.put("sign-read.txt", "signed content", {
        contentType: "text/plain",
      });

      const signed = await bucket.signUrl("sign-read.txt", {
        action: "read",
        expiresIn: 300,
      });

      expect(signed.url).toContain("sign-read.txt");
      expect(signed.expiresAt).toBeInstanceOf(Date);
      expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const response = await fetch(signed.url);
      expect(response.ok).toBe(true);
      expect(await response.text()).toBe("signed content");
    });

    it("should generate a write URL that accepts an upload", async () => {
      const signed = await bucket.signUrl("sign-write.txt", {
        action: "write",
        expiresIn: 300,
        contentType: "text/plain",
      });

      expect(signed.url).toContain("sign-write.txt");

      const putResponse = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "uploaded via signed url",
      });
      expect(putResponse.ok).toBe(true);

      const readBack = await bucket.get("sign-write.txt");
      expect(readBack).not.toBeNull();
      expect(await streamToString(readBack!.data)).toBe("uploaded via signed url");
    });
  });
});
