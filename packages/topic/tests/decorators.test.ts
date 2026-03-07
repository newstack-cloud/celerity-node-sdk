import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { INJECT_METADATA, USE_RESOURCE_METADATA } from "@celerity-sdk/common";
import { Topic, topicToken, DEFAULT_TOPIC_TOKEN } from "../src/decorators";

describe("topicToken", () => {
  it("returns a well-known symbol for a named resource", () => {
    const token = topicToken("orderEvents");
    expect(token).toBe(Symbol.for("celerity:topic:orderEvents"));
  });

  it("returns the same symbol for the same name", () => {
    expect(topicToken("events")).toBe(topicToken("events"));
  });
});

describe("DEFAULT_TOPIC_TOKEN", () => {
  it("is the well-known default symbol", () => {
    expect(DEFAULT_TOPIC_TOKEN).toBe(Symbol.for("celerity:topic:default"));
  });
});

describe("@Topic() decorator", () => {
  it("writes INJECT_METADATA with the named token", () => {
    class TestClass {
      constructor(@Topic("orderEvents") _topic: unknown) {}
    }

    const metadata: Map<number, unknown> = Reflect.getOwnMetadata(INJECT_METADATA, TestClass);
    expect(metadata).toBeInstanceOf(Map);
    expect(metadata.get(0)).toBe(topicToken("orderEvents"));
  });

  it("writes USE_RESOURCE_METADATA with the resource name", () => {
    class TestClass {
      constructor(@Topic("orderEvents") _topic: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, TestClass);
    expect(resources).toEqual(["orderEvents"]);
  });

  it("uses DEFAULT_TOPIC_TOKEN when no name is provided", () => {
    class TestClass {
      constructor(@Topic() _topic: unknown) {}
    }

    const metadata: Map<number, unknown> = Reflect.getOwnMetadata(INJECT_METADATA, TestClass);
    expect(metadata.get(0)).toBe(DEFAULT_TOPIC_TOKEN);
  });

  it("does not write USE_RESOURCE_METADATA when no name is provided", () => {
    class TestClass {
      constructor(@Topic() _topic: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, TestClass);
    expect(resources).toBeUndefined();
  });

  it("does not duplicate resource names", () => {
    class TestClass {
      constructor(
        @Topic("events") _a: unknown,
        @Topic("events") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, TestClass);
    expect(resources).toEqual(["events"]);
  });

  it("accumulates multiple distinct resource names", () => {
    class TestClass {
      constructor(
        @Topic("orderEvents") _a: unknown,
        @Topic("auditEvents") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, TestClass);
    expect(resources).toContain("orderEvents");
    expect(resources).toContain("auditEvents");
    expect(resources).toHaveLength(2);
  });
});
