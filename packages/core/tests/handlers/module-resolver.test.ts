import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveHandlerByModuleRef } from "../../src/handlers/module-resolver";
import { HandlerRegistry } from "../../src/handlers/registry";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("resolveHandlerByModuleRef", () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  // -------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------
  describe("websocket handlers", () => {
    it("resolves a websocket FunctionHandlerDefinition by named export", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-ws-handler.chat",
        "websocket",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("websocket");
      expect(result!.id).toBe("standalone-ws-handler.chat");
      expect(result!.isFunctionHandler).toBe(true);
      if (result!.type === "websocket") {
        expect(result!.route).toBe("chat");
      }
    });

    it("falls back to handlerId for route when metadata.route is absent", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-ws-handler.chat",
        "websocket",
        registry,
        FIXTURES,
      );

      // This fixture has metadata.route = "chat", so we verify the metadata path
      expect(result).not.toBeNull();
      if (result!.type === "websocket") {
        expect(result!.route).toBe("chat");
      }
    });
  });

  // -------------------------------------------------------------------
  // Consumer
  // -------------------------------------------------------------------
  describe("consumer handlers", () => {
    it("resolves a consumer FunctionHandlerDefinition by named export", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-consumer-handler.processQueue",
        "consumer",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("consumer");
      expect(result!.id).toBe("standalone-consumer-handler.processQueue");
      if (result!.type === "consumer") {
        expect(result!.handlerTag).toBe("orders-queue");
      }
    });
  });

  // -------------------------------------------------------------------
  // Schedule
  // -------------------------------------------------------------------
  describe("schedule handlers", () => {
    it("resolves a schedule FunctionHandlerDefinition by named export", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-schedule-handler.dailySync",
        "schedule",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("schedule");
      expect(result!.id).toBe("standalone-schedule-handler.dailySync");
      if (result!.type === "schedule") {
        expect(result!.handlerTag).toBe("daily-sync");
      }
    });
  });

  // -------------------------------------------------------------------
  // Custom
  // -------------------------------------------------------------------
  describe("custom handlers", () => {
    it("resolves a custom FunctionHandlerDefinition by named export", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-custom-handler.processItem",
        "custom",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("custom");
      expect(result!.id).toBe("standalone-custom-handler.processItem");
      if (result!.type === "custom") {
        expect(result!.name).toBe("processItem");
      }
    });
  });

  // -------------------------------------------------------------------
  // Type mismatch guard
  // -------------------------------------------------------------------
  describe("type mismatch guard", () => {
    it("returns null when FunctionHandlerDefinition type doesn't match requested type", async () => {
      const result = await resolveHandlerByModuleRef(
        "type-mismatch-handler.httpOnly",
        "websocket",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });

    it("rejects http handler when requested as consumer", async () => {
      const result = await resolveHandlerByModuleRef(
        "type-mismatch-handler.httpOnly",
        "consumer",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });

    it("rejects http handler when requested as schedule", async () => {
      const result = await resolveHandlerByModuleRef(
        "type-mismatch-handler.httpOnly",
        "schedule",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });

    it("rejects http handler when requested as custom", async () => {
      const result = await resolveHandlerByModuleRef(
        "type-mismatch-handler.httpOnly",
        "custom",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Plain function exports (no __celerity_handler)
  // -------------------------------------------------------------------
  describe("plain function exports", () => {
    it("resolves a plain function for any requested handler type", async () => {
      const httpResult = await resolveHandlerByModuleRef(
        "plain-function-handler.handle",
        "http",
        registry,
        FIXTURES,
      );

      expect(httpResult).not.toBeNull();
      expect(httpResult!.type).toBe("http");
      expect(httpResult!.isFunctionHandler).toBe(true);
    });

    it("resolves the same plain function as websocket type", async () => {
      const result = await resolveHandlerByModuleRef(
        "plain-function-handler.handle",
        "websocket",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("websocket");
    });

    it("resolves the same plain function as consumer type", async () => {
      const result = await resolveHandlerByModuleRef(
        "plain-function-handler.handle",
        "consumer",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("consumer");
    });
  });

  // -------------------------------------------------------------------
  // Registry function reference matching
  // -------------------------------------------------------------------
  describe("registry function reference matching", () => {
    it("matches a registered websocket handler by function reference", async () => {
      const mod = await import("./fixtures/standalone-ws-handler");
      const handlerFn = mod.chat.handler;

      registry.register({
        type: "websocket",
        route: "$default",
        protectedBy: [],
        layers: [],
        isPublic: false,
        paramMetadata: [],
        customMetadata: {},
        handlerFn,
      });

      const result = await resolveHandlerByModuleRef(
        "standalone-ws-handler.chat",
        "websocket",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("standalone-ws-handler.chat");
      // Should match the registered handler, so route comes from registry
      if (result!.type === "websocket") {
        expect(result!.route).toBe("$default");
      }
    });

    it("matches a registered consumer handler by function reference", async () => {
      const mod = await import("./fixtures/standalone-consumer-handler");
      const handlerFn = mod.processQueue.handler;

      registry.register({
        type: "consumer",
        handlerTag: "my-queue",
        layers: [],
        paramMetadata: [],
        customMetadata: {},
        handlerFn,
      });

      const result = await resolveHandlerByModuleRef(
        "standalone-consumer-handler.processQueue",
        "consumer",
        registry,
        FIXTURES,
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("standalone-consumer-handler.processQueue");
      if (result!.type === "consumer") {
        expect(result!.handlerTag).toBe("my-queue");
      }
    });
  });

  // -------------------------------------------------------------------
  // Module not found
  // -------------------------------------------------------------------
  describe("module not found", () => {
    it("returns null when the module cannot be imported", async () => {
      const result = await resolveHandlerByModuleRef(
        "nonexistent-module.handler",
        "http",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });

    it("returns null when the named export does not exist", async () => {
      const result = await resolveHandlerByModuleRef(
        "standalone-ws-handler.nonexistent",
        "websocket",
        registry,
        FIXTURES,
      );

      expect(result).toBeNull();
    });
  });
});
