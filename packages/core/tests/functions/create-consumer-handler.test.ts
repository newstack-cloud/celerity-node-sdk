import { describe, it, expect, vi } from "vitest";
import { createConsumerHandler } from "../../src/functions/create-consumer-handler";
import type { CelerityLayer, BaseHandlerContext } from "@celerity-sdk/types";

describe("createConsumerHandler", () => {
  it("returns a FunctionHandlerDefinition with type consumer", () => {
    const handler = vi.fn();
    const result = createConsumerHandler({}, handler);

    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("consumer");
    expect(result.handler).toBe(handler);
  });

  it("sets route from config", () => {
    const result = createConsumerHandler({ route: "new-order" }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.route).toBe("new-order");
  });

  it("omits route from metadata when not provided", () => {
    const result = createConsumerHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("route");
  });

  it("sets messageSchema from config", () => {
    const schema = { parse: (data: unknown) => data as { id: string } };
    const result = createConsumerHandler({ messageSchema: schema }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.messageSchema).toBe(schema);
  });

  it("omits messageSchema from metadata when not provided", () => {
    const result = createConsumerHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("messageSchema");
  });

  it("defaults layers to an empty array when not provided", () => {
    const result = createConsumerHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([]);
  });

  it("includes layers when provided", () => {
    class TestLayer implements CelerityLayer<BaseHandlerContext> {
      async handle(_ctx: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    const result = createConsumerHandler({ layers: [TestLayer] }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([TestLayer]);
  });

  it("defaults inject to an empty array when not provided", () => {
    const result = createConsumerHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([]);
  });

  it("includes inject tokens when provided", () => {
    const DB_TOKEN = Symbol("DB");
    const result = createConsumerHandler({ inject: [DB_TOKEN, "LOGGER"] }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([DB_TOKEN, "LOGGER"]);
  });

  it("defaults customMetadata to an empty object when not provided", () => {
    const result = createConsumerHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.customMetadata).toEqual({});
  });

  it("includes custom metadata when provided", () => {
    const result = createConsumerHandler({ metadata: { source: "orders" } }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.customMetadata).toEqual({ source: "orders" });
  });

  it("includes all config options together", () => {
    const schema = { parse: (data: unknown) => data };
    const DB_TOKEN = Symbol("DB");

    const handler = vi.fn();
    const result = createConsumerHandler(
      {
        route: "new-order",
        messageSchema: schema,
        inject: [DB_TOKEN],
        layers: [],
        metadata: { priority: "high" },
      },
      handler,
    );

    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("consumer");
    expect(result.handler).toBe(handler);

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.route).toBe("new-order");
    expect(meta.messageSchema).toBe(schema);
    expect(meta.inject).toEqual([DB_TOKEN]);
    expect(meta.layers).toEqual([]);
    expect(meta.customMetadata).toEqual({ priority: "high" });
  });
});
