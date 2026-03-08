import { describe, it, expect } from "vitest";
import { mapBucketEventType, mapDatastoreEventType } from "../src/event-type-mapping";

describe("mapBucketEventType", () => {
  it.each([
    // Subscription format (s3: prefix) — used by MinIO bridge and runtime
    ["s3:ObjectCreated:Put", "created"],
    ["s3:ObjectCreated:Post", "created"],
    ["s3:ObjectCreated:Copy", "created"],
    ["s3:ObjectCreated:CompleteMultipartUpload", "created"],
    ["s3:ObjectRestore:Post", "created"],
    ["s3:ObjectRestore:Completed", "created"],
    ["s3:ObjectRestore:Delete", "created"],
    // Notification format (no prefix) — used in S3 notification JSON body
    ["ObjectCreated:Put", "created"],
    ["ObjectRestore:Completed", "created"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapBucketEventType(input)).toBe(expected);
  });

  it.each([
    ["s3:ObjectRemoved:Delete", "deleted"],
    ["s3:ObjectRemoved:DeleteMarkerCreated", "deleted"],
    ["ObjectRemoved:Delete", "deleted"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapBucketEventType(input)).toBe(expected);
  });

  it.each([
    ["s3:ObjectTagging:Put", "metadataUpdated"],
    ["s3:ObjectTagging:Delete", "metadataUpdated"],
    ["s3:ObjectAcl:Put", "metadataUpdated"],
    ["ObjectTagging:Put", "metadataUpdated"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapBucketEventType(input)).toBe(expected);
  });

  it("returns undefined for unknown event names", () => {
    expect(mapBucketEventType("s3:TestEvent")).toBeUndefined();
    expect(mapBucketEventType("unknown")).toBeUndefined();
    expect(mapBucketEventType("")).toBeUndefined();
  });
});

describe("mapDatastoreEventType", () => {
  it.each([
    ["INSERT", "inserted"],
    ["MODIFY", "modified"],
    ["REMOVE", "removed"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapDatastoreEventType(input)).toBe(expected);
  });

  it("returns undefined for unknown event names", () => {
    expect(mapDatastoreEventType("UPDATE")).toBeUndefined();
    expect(mapDatastoreEventType("DELETE")).toBeUndefined();
    expect(mapDatastoreEventType("unknown")).toBeUndefined();
    expect(mapDatastoreEventType("")).toBeUndefined();
  });
});
