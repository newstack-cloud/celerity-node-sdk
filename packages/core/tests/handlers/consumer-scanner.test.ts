import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "../../src/handlers/registry";
import { scanConsumerHandlers } from "../../src/handlers/scanners/consumer";
import { Container } from "../../src/di/container";
import { Consumer, MessageHandler } from "../../src/decorators/consumer";
import { Messages, EventInput } from "../../src/decorators/consumer-params";
import { Module } from "../../src/decorators/module";
import { buildModuleGraph, registerModuleGraph } from "../../src/bootstrap/module-graph";
import type { FunctionHandlerDefinition, BaseHandlerContext, CelerityLayer } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@Consumer()
class OrderConsumer {
  @MessageHandler()
  processDefault(@Messages() _messages: unknown[]) {}

  @MessageHandler("priority")
  processPriority(@Messages() _messages: unknown[], @EventInput() _event: unknown) {}
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
  await scanConsumerHandlers(graph, container, registry);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanConsumerHandlers", () => {
  let registry: HandlerRegistry;
  let container: Container;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
  });

  describe("class handlers", () => {
    it("registers all @MessageHandler methods from a @Consumer class", async () => {
      @Module({ controllers: [OrderConsumer] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("consumer");
      expect(handlers).toHaveLength(2);

      const tags = handlers.map((h) => h.handlerTag);
      // handlerTag is always the method name (route is for Rust runtime routing, not SDK lookup)
      expect(tags).toContain("processDefault");
      expect(tags).toContain("processPriority");
    });

    it("looks up handlers by handlerTag via getHandler", async () => {
      @Module({ controllers: [OrderConsumer] })
      class M {}

      await scanModule(M, container, registry);

      const priorityHandler = registry.getHandler("consumer", "processPriority");
      expect(priorityHandler).toBeDefined();
      expect(priorityHandler!.handlerTag).toBe("processPriority");
    });

    it("stores param metadata on registered handlers", async () => {
      @Module({ controllers: [OrderConsumer] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "processPriority");
      expect(handler).toBeDefined();
      expect(handler!.paramMetadata).toHaveLength(2);
      expect(handler!.paramMetadata.map((p) => p.type)).toContain("messages");
      expect(handler!.paramMetadata.map((p) => p.type)).toContain("consumerEvent");
    });

    it("does not register methods without @MessageHandler", async () => {
      @Consumer()
      class PartialConsumer {
        @MessageHandler()
        process() {}

        // No decorator — should be ignored
        helper() {}
      }

      @Module({ controllers: [PartialConsumer] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("consumer")).toHaveLength(1);
    });

    it("ignores classes without @Consumer", async () => {
      class PlainClass {
        @MessageHandler()
        process() {}
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      @Module({ controllers: [PlainClass as any] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("consumer")).toHaveLength(0);
    });
  });

  describe("function handlers", () => {
    it("registers consumer function handlers", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "new-order",
        type: "consumer",
        metadata: { route: "new-order", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("consumer");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handlerTag).toBe("new-order");
      expect(handlers[0].isFunctionHandler).toBe(true);
    });

    it("defaults handlerTag to definition id when route not specified", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "consumer.orders",
        type: "consumer",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "consumer.orders");
      expect(handler).toBeDefined();
    });

    it("defaults handlerTag to 'default' when neither route nor id specified", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "consumer",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "default");
      expect(handler).toBeDefined();
    });

    it("stores inject tokens from function handler metadata", async () => {
      const TOKEN = Symbol("TOKEN");
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "new-order",
        type: "consumer",
        metadata: { route: "new-order", inject: [TOKEN] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "new-order");
      expect(handler!.injectTokens).toEqual([TOKEN]);
    });

    it("creates validation layer for function handlers with messageSchema", async () => {
      const schema = { parse: (data: unknown) => data };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "validated",
        type: "consumer",
        metadata: { route: "validated", messageSchema: schema },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "validated");
      expect(handler!.layers).toHaveLength(1);
      expect(handler!.customMetadata).not.toHaveProperty("messageSchema");
    });

    it("skips non-consumer function handlers", async () => {
      const httpHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/hello", method: "GET" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [httpHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("consumer")).toHaveLength(0);
    });

    it("registers with id for getHandlerById lookup", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "consumer.orders.new",
        type: "consumer",
        metadata: { route: "new-order" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandlerById("consumer", "consumer.orders.new");
      expect(handler).toBeDefined();
      expect(handler!.id).toBe("consumer.orders.new");
    });
  });

  describe("module-level layers", () => {
    it("prepends module layers to class handler layers", async () => {
      const moduleLayer: CelerityLayer<BaseHandlerContext> = {
        handle: async (_ctx, next) => next(),
      };

      @Module({ controllers: [OrderConsumer], layers: [moduleLayer] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "processDefault");
      expect(handler).toBeDefined();
      expect(handler!.layers[0]).toBe(moduleLayer);
    });

    it("prepends module layers to function handler layers", async () => {
      const moduleLayer: CelerityLayer<BaseHandlerContext> = {
        handle: async (_ctx, next) => next(),
      };
      const handlerLayer: CelerityLayer<BaseHandlerContext> = {
        handle: async (_ctx, next) => next(),
      };

      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "fn-consumer",
        type: "consumer",
        metadata: { layers: [handlerLayer] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler], layers: [moduleLayer] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("consumer", "fn-consumer");
      expect(handler).toBeDefined();
      expect(handler!.layers[0]).toBe(moduleLayer);
      expect(handler!.layers[1]).toBe(handlerLayer);
    });
  });
});
