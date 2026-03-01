import { describe, it, expect, vi } from "vitest";
import { createCustomHandler } from "../../src/functions/create-custom-handler";

describe("createCustomHandler", () => {
  const handler = vi.fn(async () => ({ result: "ok" }));

  it("returns a FunctionHandlerDefinition with type 'custom'", () => {
    const def = createCustomHandler({}, handler);
    expect(def.__celerity_handler).toBe(true);
    expect(def.type).toBe("custom");
    expect(def.handler).toBe(handler);
  });

  it("stores name from config", () => {
    const def = createCustomHandler({ name: "processPayment" }, handler);
    expect(def.metadata.name).toBe("processPayment");
  });

  it("stores schema in metadata", () => {
    const schema = { parse: (data: unknown) => data };
    const def = createCustomHandler({ schema }, handler);
    expect(def.metadata.schema).toBe(schema);
  });

  it("stores inject tokens in metadata", () => {
    const TOKEN = Symbol("TOKEN");
    const def = createCustomHandler({ inject: [TOKEN] }, handler);
    expect(def.metadata.inject).toEqual([TOKEN]);
  });

  it("stores custom metadata", () => {
    const def = createCustomHandler({ metadata: { foo: "bar" } }, handler);
    expect(def.metadata.customMetadata).toEqual({ foo: "bar" });
  });

  it("defaults inject/layers/customMetadata to empty", () => {
    const def = createCustomHandler({}, handler);
    expect(def.metadata.inject).toEqual([]);
    expect(def.metadata.layers).toEqual([]);
    expect(def.metadata.customMetadata).toEqual({});
  });

  it("omits name when not provided", () => {
    const def = createCustomHandler({}, handler);
    expect(def.metadata.name).toBeUndefined();
  });

  it("omits schema when not provided", () => {
    const def = createCustomHandler({}, handler);
    expect(def.metadata.schema).toBeUndefined();
  });
});
