import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  captureResourceLinks,
  getLinksOfType,
  getResourceTypes,
  RESOURCE_CONFIG_NAMESPACE,
  RESOURCE_LINKS_FILENAME,
} from "../src/resource-links";

describe("resource-links", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "celerity-resource-links-"));
  });

  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS_PATH;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("RESOURCE_CONFIG_NAMESPACE", () => {
    it('is "resources"', () => {
      expect(RESOURCE_CONFIG_NAMESPACE).toBe("resources");
    });
  });

  describe("captureResourceLinks", () => {
    const writeLinksFile = (contents: string): string => {
      const path = join(tmpDir, RESOURCE_LINKS_FILENAME);
      writeFileSync(path, contents, "utf8");
      process.env.CELERITY_RESOURCE_LINKS_PATH = path;
      return path;
    };

    it("parses an empty object file", () => {
      writeLinksFile("{}");
      const links = captureResourceLinks();
      expect(links.size).toBe(0);
    });

    it("parses a single resource link", () => {
      writeLinksFile(
        JSON.stringify({
          imagesBucket: { type: "bucket", configKey: "imagesBucket" },
        }),
      );

      const links = captureResourceLinks();

      expect(links.size).toBe(1);
      expect(links.get("imagesBucket")).toEqual({
        type: "bucket",
        configKey: "imagesBucket",
      });
    });

    it("parses multiple resource links of different types", () => {
      writeLinksFile(
        JSON.stringify({
          imagesBucket: { type: "bucket", configKey: "imagesBucket" },
          orderQueue: { type: "queue", configKey: "orderQueue" },
          sessionCache: { type: "cache", configKey: "sessionCache" },
        }),
      );

      const links = captureResourceLinks();

      expect(links.size).toBe(3);
      expect(links.get("imagesBucket")?.type).toBe("bucket");
      expect(links.get("orderQueue")?.type).toBe("queue");
      expect(links.get("sessionCache")?.type).toBe("cache");
    });

    it("throws when the file is missing", () => {
      process.env.CELERITY_RESOURCE_LINKS_PATH = join(tmpDir, "does-not-exist.json");
      expect(() => captureResourceLinks()).toThrow(/resource links file not found/);
    });

    it("throws when the file contains invalid JSON", () => {
      writeLinksFile("not-json");
      expect(() => captureResourceLinks()).toThrow(/not valid JSON/);
    });
  });

  describe("getLinksOfType", () => {
    it("returns only links matching the given type", () => {
      const links = new Map([
        ["imagesBucket", { type: "bucket", configKey: "imagesBucket" }],
        ["archiveBucket", { type: "bucket", configKey: "archiveBucket" }],
        ["orderQueue", { type: "queue", configKey: "orderQueue" }],
      ]);

      const buckets = getLinksOfType(links, "bucket");

      expect(buckets.size).toBe(2);
      expect(buckets.get("imagesBucket")).toBe("imagesBucket");
      expect(buckets.get("archiveBucket")).toBe("archiveBucket");
    });

    it("returns an empty map when no links match the type", () => {
      const links = new Map([
        ["orderQueue", { type: "queue", configKey: "orderQueue" }],
      ]);

      const buckets = getLinksOfType(links, "bucket");
      expect(buckets.size).toBe(0);
    });

    it("returns resourceName → configKey mapping", () => {
      const links = new Map([
        ["imagesBucket", { type: "bucket", configKey: "imgs" }],
      ]);

      const buckets = getLinksOfType(links, "bucket");
      expect(buckets.get("imagesBucket")).toBe("imgs");
    });
  });

  describe("getResourceTypes", () => {
    it("returns unique resource types", () => {
      const links = new Map([
        ["imagesBucket", { type: "bucket", configKey: "imagesBucket" }],
        ["archiveBucket", { type: "bucket", configKey: "archiveBucket" }],
        ["orderQueue", { type: "queue", configKey: "orderQueue" }],
      ]);

      const types = getResourceTypes(links);

      expect(types).toEqual(new Set(["bucket", "queue"]));
    });

    it("returns an empty set for an empty map", () => {
      const types = getResourceTypes(new Map());
      expect(types.size).toBe(0);
    });
  });
});
