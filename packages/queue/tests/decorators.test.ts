import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Queue, queueToken, DEFAULT_QUEUE_TOKEN } from "../src/decorators";

const INJECT_KEY = Symbol.for("celerity:inject");
const USE_RESOURCE_KEY = Symbol.for("celerity:useResource");

describe("@Queue() decorator", () => {
  it("writes the resource-specific inject token for a named resource", () => {
    class TestHandler {
      constructor(@Queue("ordersQueue") _orders: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(queueToken("ordersQueue"));
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@Queue("ordersQueue") _orders: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["ordersQueue"]);
  });

  it("writes DEFAULT_QUEUE_TOKEN when no resource name is given", () => {
    class TestHandler {
      constructor(@Queue() _queue: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_QUEUE_TOKEN);
  });

  it("does not write USE_RESOURCE metadata for unnamed queues", () => {
    class TestHandler {
      constructor(@Queue() _queue: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toBeUndefined();
  });

  it("accumulates inject tokens across multiple parameters", () => {
    class TestHandler {
      constructor(
        @Queue("ordersQueue") _orders: unknown,
        @Queue("eventsQueue") _events: unknown,
      ) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(queueToken("ordersQueue"));
    expect(injectMap.get(1)).toBe(queueToken("eventsQueue"));
  });

  it("accumulates USE_RESOURCE metadata across multiple named parameters", () => {
    class TestHandler {
      constructor(
        @Queue("ordersQueue") _orders: unknown,
        @Queue("eventsQueue") _events: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toContain("ordersQueue");
    expect(resources).toContain("eventsQueue");
    expect(resources).toHaveLength(2);
  });

  it("does not duplicate USE_RESOURCE entries for the same resource name", () => {
    class TestHandler {
      constructor(
        @Queue("ordersQueue") _a: unknown,
        @Queue("ordersQueue") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["ordersQueue"]);
  });
});

describe("queueToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = queueToken("ordersQueue");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:queue:ordersQueue"));
  });

  it("returns the same symbol for the same resource name", () => {
    expect(queueToken("orders")).toBe(queueToken("orders"));
  });

  it("returns different symbols for different resource names", () => {
    expect(queueToken("orders")).not.toBe(queueToken("events"));
  });
});

describe("DEFAULT_QUEUE_TOKEN", () => {
  it("is a well-known symbol", () => {
    expect(DEFAULT_QUEUE_TOKEN).toBe(Symbol.for("celerity:queue:default"));
  });
});
