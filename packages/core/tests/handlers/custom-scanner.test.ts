import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "../../src/handlers/registry";
import { scanCustomHandlers } from "../../src/handlers/scanners/custom";
import { Container } from "../../src/di/container";
import { Controller } from "../../src/decorators/controller";
import { Consumer } from "../../src/decorators/consumer";
import { WebSocketController } from "../../src/decorators/websocket";
import { Invoke } from "../../src/decorators/invoke";
import { Payload, InvokeContext } from "../../src/decorators/invoke-params";
import { ProtectedBy } from "../../src/decorators/guards";
import { UseLayer } from "../../src/decorators/layer";
import { Module } from "../../src/decorators/module";
import { buildModuleGraph, registerModuleGraph } from "../../src/bootstrap/module-graph";
import type { CelerityLayer, BaseHandlerContext, FunctionHandlerDefinition } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@Controller()
class PaymentHandlers {
  @Invoke("processPayment")
  process(@Payload() _payload: unknown) {}

  @Invoke("refundPayment")
  refund(@Payload() _payload: unknown, @InvokeContext() _ctx: unknown) {}
}

class LoggingLayer implements CelerityLayer<BaseHandlerContext> {
  async handle(_ctx: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

@Controller("/admin")
@ProtectedBy("jwt")
@UseLayer(LoggingLayer)
class AdminController {
  @Invoke("reprocessOrders")
  reprocess() {}
}

// Cross-cutting: invoke on a @Consumer class
@Consumer("orders")
class OrderConsumer {
  @Invoke("manualReprocess")
  reprocess() {}
}

// Cross-cutting: invoke on a @WebSocketController class
@WebSocketController()
class WsController {
  @Invoke("broadcastNotification")
  broadcast() {}
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
  await scanCustomHandlers(graph, container, registry);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanCustomHandlers", () => {
  let registry: HandlerRegistry;
  let container: Container;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
  });

  describe("class handlers on @Controller", () => {
    it("registers @Invoke methods from a @Controller class", async () => {
      @Module({ controllers: [PaymentHandlers] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("custom");
      expect(handlers).toHaveLength(2);
      const names = handlers.map((h) => h.name);
      expect(names).toContain("processPayment");
      expect(names).toContain("refundPayment");
    });

    it("looks up handlers by name via getHandler", async () => {
      @Module({ controllers: [PaymentHandlers] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "processPayment");
      expect(handler).toBeDefined();
      expect(handler!.name).toBe("processPayment");
    });

    it("stores param metadata on registered handlers", async () => {
      @Module({ controllers: [PaymentHandlers] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "refundPayment");
      expect(handler!.paramMetadata).toHaveLength(2);
      const types = handler!.paramMetadata.map((p) => p.type);
      expect(types).toContain("payload");
      expect(types).toContain("invokeContext");
    });

    it("inherits class-level @UseLayer and ignores @ProtectedBy", async () => {
      @Module({ controllers: [AdminController] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "reprocessOrders");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });
  });

  describe("cross-cutting on non-Controller classes", () => {
    it("scans @Invoke on @Consumer classes", async () => {
      @Module({ controllers: [OrderConsumer] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "manualReprocess");
      expect(handler).toBeDefined();
      expect(handler!.type).toBe("custom");
    });

    it("scans @Invoke on @WebSocketController classes", async () => {
      @Module({ controllers: [WsController] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "broadcastNotification");
      expect(handler).toBeDefined();
      expect(handler!.type).toBe("custom");
    });
  });

  describe("function handlers", () => {
    it("registers custom function handlers", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "custom",
        metadata: { name: "processPayment", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("custom");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toBe("processPayment");
      expect(handlers[0].isFunctionHandler).toBe(true);
    });

    it("defaults name to definition id when name not specified", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "custom.payment",
        type: "custom",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandler("custom", "custom.payment")).toBeDefined();
    });

    it("creates validation layer for function handlers with schema", async () => {
      const schema = { parse: (data: unknown) => data };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "custom",
        metadata: { name: "validated", schema },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("custom", "validated");
      expect(handler!.layers).toHaveLength(1);
      expect(handler!.customMetadata).not.toHaveProperty("schema");
    });

    it("skips non-custom function handlers", async () => {
      const httpHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/hello", method: "GET" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [httpHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("custom")).toHaveLength(0);
    });
  });
});
