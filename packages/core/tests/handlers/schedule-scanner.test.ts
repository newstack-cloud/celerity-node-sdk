import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "../../src/handlers/registry";
import { scanScheduleHandlers } from "../../src/handlers/scanners/schedule";
import { Container } from "../../src/di/container";
import { Controller } from "../../src/decorators/controller";
import { Consumer } from "../../src/decorators/consumer";
import { WebSocketController } from "../../src/decorators/websocket";
import { ScheduleHandler } from "../../src/decorators/schedule";
import { ScheduleInput } from "../../src/decorators/schedule-params";
import { ProtectedBy } from "../../src/decorators/guards";
import { UseLayer } from "../../src/decorators/layer";
import { Module } from "../../src/decorators/module";
import { buildModuleGraph, registerModuleGraph } from "../../src/bootstrap/module-graph";
import type { CelerityLayer, BaseHandlerContext, FunctionHandlerDefinition } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@Controller()
class MaintenanceTasks {
  @ScheduleHandler("daily-cleanup")
  cleanup(@ScheduleInput() _input: unknown) {}

  @ScheduleHandler("rate(1 hour)")
  sync() {}
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
  @ScheduleHandler("weekly-report")
  generateReport() {}
}

// Cross-cutting: schedule on a @Consumer class
@Consumer("orders")
class OrderConsumer {
  @ScheduleHandler("order-reconciliation")
  reconcile() {}
}

// Cross-cutting: schedule on a @WebSocketController class
@WebSocketController()
class WsController {
  @ScheduleHandler("ws-cleanup")
  cleanupConnections() {}
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
  await scanScheduleHandlers(graph, container, registry);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanScheduleHandlers", () => {
  let registry: HandlerRegistry;
  let container: Container;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
  });

  describe("class handlers on @Controller", () => {
    it("registers @ScheduleHandler methods from a @Controller class", async () => {
      @Module({ controllers: [MaintenanceTasks] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("schedule");
      expect(handlers).toHaveLength(2);
      const tags = handlers.map((h) => h.handlerTag);
      expect(tags).toContain("daily-cleanup");
      expect(tags).toContain("sync");
    });

    it("uses scheduleId as handlerTag, falls back to method name", async () => {
      @Module({ controllers: [MaintenanceTasks] })
      class M {}

      await scanModule(M, container, registry);

      // "daily-cleanup" comes from scheduleId, "sync" from method name (rate expression is not an id)
      expect(registry.getHandler("schedule", "daily-cleanup")).toBeDefined();
      expect(registry.getHandler("schedule", "sync")).toBeDefined();
    });

    it("stores param metadata on registered handlers", async () => {
      @Module({ controllers: [MaintenanceTasks] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("schedule", "daily-cleanup");
      expect(handler!.paramMetadata).toHaveLength(1);
      expect(handler!.paramMetadata[0].type).toBe("scheduleInput");
    });

    it("inherits class-level @UseLayer and ignores @ProtectedBy", async () => {
      @Module({ controllers: [AdminController] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("schedule", "weekly-report");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });
  });

  describe("cross-cutting on non-Controller classes", () => {
    it("scans @ScheduleHandler on @Consumer classes", async () => {
      @Module({ controllers: [OrderConsumer] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("schedule", "order-reconciliation");
      expect(handler).toBeDefined();
      expect(handler!.type).toBe("schedule");
    });

    it("scans @ScheduleHandler on @WebSocketController classes", async () => {
      @Module({ controllers: [WsController] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("schedule", "ws-cleanup");
      expect(handler).toBeDefined();
      expect(handler!.type).toBe("schedule");
    });
  });

  describe("function handlers", () => {
    it("registers schedule function handlers", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "schedule",
        metadata: { scheduleId: "daily-task", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handlers = registry.getHandlersByType("schedule");
      expect(handlers).toHaveLength(1);
      expect(handlers[0].handlerTag).toBe("daily-task");
      expect(handlers[0].isFunctionHandler).toBe(true);
    });

    it("defaults handlerTag to definition id when scheduleId not specified", async () => {
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        id: "schedule.cleanup",
        type: "schedule",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandler("schedule", "schedule.cleanup")).toBeDefined();
    });

    it("creates validation layer for function handlers with schema", async () => {
      const schema = { parse: (data: unknown) => data };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "schedule",
        metadata: { scheduleId: "validated", schema },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      await scanModule(M, container, registry);

      const handler = registry.getHandler("schedule", "validated");
      expect(handler!.layers).toHaveLength(1);
      expect(handler!.customMetadata).not.toHaveProperty("schema");
    });

    it("skips non-schedule function handlers", async () => {
      const httpHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/hello", method: "GET" },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [httpHandler] })
      class M {}

      await scanModule(M, container, registry);

      expect(registry.getHandlersByType("schedule")).toHaveLength(0);
    });
  });
});
