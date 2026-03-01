import { describe, it, expect, vi } from "vitest";
import { createWebSocketHandler } from "../../src/functions/create-websocket-handler";
import type { CelerityLayer, BaseHandlerContext } from "@celerity-sdk/types";

describe("createWebSocketHandler", () => {
  it("returns a FunctionHandlerDefinition with type websocket", () => {
    const handler = vi.fn();
    const result = createWebSocketHandler({}, handler);

    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("websocket");
    expect(result.handler).toBe(handler);
  });

  it("sets route from config", () => {
    const result = createWebSocketHandler({ route: "chat" }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.route).toBe("chat");
  });

  it("omits route from metadata when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("route");
  });

  it("sets protectedBy from config", () => {
    const result = createWebSocketHandler({ protectedBy: ["jwt", "rbac"] }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.protectedBy).toEqual(["jwt", "rbac"]);
  });

  it("omits protectedBy from metadata when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("protectedBy");
  });

  it("sets schema from config", () => {
    const schema = { parse: (data: unknown) => data as { msg: string } };
    const result = createWebSocketHandler({ schema }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toBe(schema);
  });

  it("omits schema from metadata when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("schema");
  });

  it("defaults layers to an empty array when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([]);
  });

  it("includes layers when provided", () => {
    class TestLayer implements CelerityLayer<BaseHandlerContext> {
      async handle(_ctx: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    const result = createWebSocketHandler({ layers: [TestLayer] }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([TestLayer]);
  });

  it("defaults inject to an empty array when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([]);
  });

  it("includes inject tokens when provided", () => {
    const DB_TOKEN = Symbol("DB");
    const result = createWebSocketHandler({ inject: [DB_TOKEN, "LOGGER"] }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([DB_TOKEN, "LOGGER"]);
  });

  it("defaults customMetadata to an empty object when not provided", () => {
    const result = createWebSocketHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.customMetadata).toEqual({});
  });

  it("includes custom metadata when provided", () => {
    const result = createWebSocketHandler({ metadata: { action: "chat:send" } }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.customMetadata).toEqual({ action: "chat:send" });
  });

  it("includes all config options together", () => {
    const schema = { parse: (data: unknown) => data };
    const DB_TOKEN = Symbol("DB");

    const handler = vi.fn();
    const result = createWebSocketHandler(
      {
        route: "notifications",
        protectedBy: ["jwt"],
        schema,
        inject: [DB_TOKEN],
        metadata: { priority: "high" },
      },
      handler,
    );

    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("websocket");
    expect(result.handler).toBe(handler);

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.route).toBe("notifications");
    expect(meta.protectedBy).toEqual(["jwt"]);
    expect(meta.schema).toBe(schema);
    expect(meta.inject).toEqual([DB_TOKEN]);
    expect(meta.customMetadata).toEqual({ priority: "high" });
  });
});
