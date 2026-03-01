import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "../../src/handlers/registry";
import { scanWebSocketHandlers } from "../../src/handlers/scanners/websocket";
import { Container } from "../../src/di/container";
import { WebSocketController, OnConnect, OnMessage, OnDisconnect } from "../../src/decorators/websocket";
import { ConnectionId, MessageBody } from "../../src/decorators/websocket-params";
import { ProtectedBy } from "../../src/decorators/guards";
import { UseLayer } from "../../src/decorators/layer";
import { Module } from "../../src/decorators/module";
import { buildModuleGraph, registerModuleGraph } from "../../src/bootstrap/module-graph";
import type { CelerityLayer, BaseHandlerContext, FunctionHandlerDefinition } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@WebSocketController()
class ChatHandler {
  @OnConnect()
  connect(@ConnectionId() _id: string) {}

  @OnMessage()
  message(@ConnectionId() _id: string, @MessageBody() _body: unknown) {}

  @OnDisconnect()
  disconnect(@ConnectionId() _id: string) {}
}

class LoggingLayer implements CelerityLayer<BaseHandlerContext> {
  async handle(_ctx: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

@WebSocketController()
@ProtectedBy("jwt")
@UseLayer(LoggingLayer)
class ProtectedWsHandler {
  @OnMessage()
  message() {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function scanModule(
  moduleClass: { new (): unknown },
  container: Container,
  registry: HandlerRegistry,
) {
  const graph = buildModuleGraph(moduleClass);
  registerModuleGraph(graph, container);
  await scanWebSocketHandlers(graph, container, registry);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanWebSocketHandlers", () => {
  let registry: HandlerRegistry;
  let container: Container;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
  });

  describe("class handlers", () => {
    it("registers all event methods from a @WebSocketController", async () => {
      @Module({ controllers: [ChatHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("websocket");
      expect(handlers).toHaveLength(3);

      const routes = handlers.map((h) => h.route);
      expect(routes).toContain("$connect");
      expect(routes).toContain("$default");
      expect(routes).toContain("$disconnect");
    });

    it("looks up handlers by route via getHandler", async () => {
      @Module({ controllers: [ChatHandler] })
      class M {}

      await scanModule(M, container, registry);

      const connect = registry.getHandler("websocket", "$connect");
      expect(connect).toBeDefined();
      expect(connect!.route).toBe("$connect");

      const message = registry.getHandler("websocket", "$default");
      expect(message).toBeDefined();

      const disconnect = registry.getHandler("websocket", "$disconnect");
      expect(disconnect).toBeDefined();
    });

    it("stores param metadata on registered handlers", async () => {
      @Module({ controllers: [ChatHandler] })
      class M {}

      await scanModule(M, container, registry);

      const message = registry.getHandler("websocket", "$default");
      expect(message).toBeDefined();
      expect(message!.paramMetadata).toHaveLength(2);
      expect(message!.paramMetadata.map((p) => p.type)).toContain("connectionId");
      expect(message!.paramMetadata.map((p) => p.type)).toContain("messageBody");
    });

    it("inherits class-level @ProtectedBy and @UseLayer", async () => {
      @Module({ controllers: [ProtectedWsHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("websocket", "$default");
      expect(handler).toBeDefined();
      expect(handler!.protectedBy).toEqual(["jwt"]);
      expect(handler!.layers).toHaveLength(1);
    });

    it("does not register methods without event decorators", async () => {
      @WebSocketController()
      class PartialHandler {
        @OnMessage()
        message() {}

        // No decorator — should be ignored
        helper() {}
      }

      @Module({ controllers: [PartialHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("websocket")).toHaveLength(1);
    });

    it("ignores classes without @WebSocketController", async () => {
      class PlainClass {
        @OnMessage()
        message() {}
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      @Module({ controllers: [PlainClass as any] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("websocket")).toHaveLength(0);
    });
  });

  describe("function handlers", () => {
    it("registers websocket function handlers", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "websocket",
        metadata: { route: "$default", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("websocket");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].route).toBe("$default");
      expect(handlers[0].isFunctionHandler).toBe(true);
    });

    it("defaults route to $default when not specified", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "websocket",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("websocket", "$default");
      expect(handler).toBeDefined();
    });

    it("stores inject tokens from function handler metadata", async () => {
      const TOKEN = Symbol("TOKEN");
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "websocket",
        metadata: { route: "$default", inject: [TOKEN] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("websocket", "$default");
      expect(handler!.injectTokens).toEqual([TOKEN]);
    });

    it("stores protectedBy from function handler metadata", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "websocket",
        metadata: { route: "$default", protectedBy: ["jwt", "apiKey"] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("websocket", "$default");
      expect(handler!.protectedBy).toEqual(["jwt", "apiKey"]);
    });

    it("skips non-websocket function handlers", async () => {
      const httpHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/hello", method: "GET" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [httpHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("websocket")).toHaveLength(0);
    });

    it("registers with id for getHandlerById lookup", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "ws.chat.default",
        type: "websocket",
        metadata: { route: "$default" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandlerById("websocket", "ws.chat.default");
      expect(handler).toBeDefined();
      expect(handler!.id).toBe("ws.chat.default");
    });
  });
});
