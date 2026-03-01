import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Datastore, datastoreToken, DEFAULT_DATASTORE_TOKEN } from "../src/decorators";

const INJECT_KEY = Symbol.for("celerity:inject");
const USE_RESOURCE_KEY = Symbol.for("celerity:useResource");

describe("@Datastore() decorator", () => {
  it("writes the resource-specific inject token for a named resource", () => {
    class TestHandler {
      constructor(@Datastore("usersTable") _users: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(datastoreToken("usersTable"));
  });

  it("writes USE_RESOURCE metadata for a named resource", () => {
    class TestHandler {
      constructor(@Datastore("usersTable") _users: unknown) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["usersTable"]);
  });

  it("writes DEFAULT_DATASTORE_TOKEN when no resource name is given", () => {
    class TestHandler {
      constructor(@Datastore() _ds: unknown) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(DEFAULT_DATASTORE_TOKEN);
  });

  it("does not write USE_RESOURCE metadata for unnamed datastores", () => {
    class TestHandler {
      constructor(@Datastore() _ds: unknown) {}
    }

    const resources = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toBeUndefined();
  });

  it("accumulates inject tokens across multiple parameters", () => {
    class TestHandler {
      constructor(
        @Datastore("usersTable") _users: unknown,
        @Datastore("ordersTable") _orders: unknown,
      ) {}
    }

    const injectMap: Map<number, symbol> = Reflect.getOwnMetadata(INJECT_KEY, TestHandler);
    expect(injectMap.get(0)).toBe(datastoreToken("usersTable"));
    expect(injectMap.get(1)).toBe(datastoreToken("ordersTable"));
  });

  it("accumulates USE_RESOURCE metadata across multiple named parameters", () => {
    class TestHandler {
      constructor(
        @Datastore("usersTable") _users: unknown,
        @Datastore("ordersTable") _orders: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toContain("usersTable");
    expect(resources).toContain("ordersTable");
    expect(resources).toHaveLength(2);
  });

  it("does not duplicate USE_RESOURCE entries for the same resource name", () => {
    class TestHandler {
      constructor(
        @Datastore("usersTable") _a: unknown,
        @Datastore("usersTable") _b: unknown,
      ) {}
    }

    const resources: string[] = Reflect.getOwnMetadata(USE_RESOURCE_KEY, TestHandler);
    expect(resources).toEqual(["usersTable"]);
  });
});

describe("datastoreToken", () => {
  it("returns a symbol keyed by the resource name", () => {
    const token = datastoreToken("usersTable");
    expect(typeof token).toBe("symbol");
    expect(token).toBe(Symbol.for("celerity:datastore:usersTable"));
  });

  it("returns the same symbol for the same resource name", () => {
    expect(datastoreToken("users")).toBe(datastoreToken("users"));
  });

  it("returns different symbols for different resource names", () => {
    expect(datastoreToken("users")).not.toBe(datastoreToken("orders"));
  });
});

describe("DEFAULT_DATASTORE_TOKEN", () => {
  it("is a well-known symbol", () => {
    expect(DEFAULT_DATASTORE_TOKEN).toBe(Symbol.for("celerity:datastore:default"));
  });
});
