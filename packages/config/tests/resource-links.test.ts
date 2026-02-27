import { describe, it, expect, afterEach } from "vitest";
import {
  captureResourceLinks,
  getLinksOfType,
  getResourceTypes,
  RESOURCE_CONFIG_NAMESPACE,
} from "../src/resource-links";

describe("resource-links", () => {
  afterEach(() => {
    delete process.env.CELERITY_RESOURCE_LINKS;
  });

  describe("RESOURCE_CONFIG_NAMESPACE", () => {
    it('is "resources"', () => {
      expect(RESOURCE_CONFIG_NAMESPACE).toBe("resources");
    });
  });

  describe("captureResourceLinks", () => {
    it("returns an empty map when env var is not set", () => {
      const links = captureResourceLinks();
      expect(links.size).toBe(0);
    });

    it("returns an empty map when env var is an empty string", () => {
      process.env.CELERITY_RESOURCE_LINKS = "";
      const links = captureResourceLinks();
      expect(links.size).toBe(0);
    });

    it("parses a single resource link", () => {
      process.env.CELERITY_RESOURCE_LINKS = JSON.stringify({
        imagesBucket: { type: "bucket", configKey: "imagesBucket" },
      });

      const links = captureResourceLinks();

      expect(links.size).toBe(1);
      expect(links.get("imagesBucket")).toEqual({
        type: "bucket",
        configKey: "imagesBucket",
      });
    });

    it("parses multiple resource links of different types", () => {
      process.env.CELERITY_RESOURCE_LINKS = JSON.stringify({
        imagesBucket: { type: "bucket", configKey: "imagesBucket" },
        orderQueue: { type: "queue", configKey: "orderQueue" },
        sessionCache: { type: "cache", configKey: "sessionCache" },
      });

      const links = captureResourceLinks();

      expect(links.size).toBe(3);
      expect(links.get("imagesBucket")?.type).toBe("bucket");
      expect(links.get("orderQueue")?.type).toBe("queue");
      expect(links.get("sessionCache")?.type).toBe("cache");
    });

    it("throws on invalid JSON", () => {
      process.env.CELERITY_RESOURCE_LINKS = "not-json";
      expect(() => captureResourceLinks()).toThrow();
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
