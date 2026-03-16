import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { serializeManifest } from "../../src/extract/serializer";
import { buildScannedModule } from "../../src/extract/metadata-app";
import {
  Module,
  Controller,
  Get,
  Post,
  Delete,
  Guard,
  ProtectedBy,
  Public,
  SetMetadata,
  Action,
  UseResource,
  createHttpHandler,
  WebSocketController,
  OnConnect,
  OnMessage,
  OnDisconnect,
  Consumer,
  MessageHandler,
  ScheduleHandler,
  Invoke,
  createWebSocketHandler,
  createConsumerHandler,
  createScheduleHandler,
  createCustomHandler,
} from "@celerity-sdk/core";
import type { HandlerManifest, ClassHandlerEntry } from "../../src/extract/types";
import type { ScannedProvider } from "../../src/extract/metadata-app";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@Controller("/orders")
@ProtectedBy("jwt")
class OrdersHandler {
  @Get("/{orderId}")
  getOrder() {
    return {};
  }

  @Post("/")
  createOrder() {
    return {};
  }

  @Delete("/{orderId}")
  @Public()
  publicDelete() {
    return {};
  }
}

@Guard("myCustomAuth")
@Controller("/auth")
class AuthGuardHandler {
  @Post("/validate")
  validate() {
    return {};
  }
}

@Controller("/mixed")
class MixedGuardsHandler {
  @Get("/admin")
  @ProtectedBy("jwt")
  @ProtectedBy("rbac")
  adminRoute() {
    return {};
  }

  @Get("/public")
  @Public()
  publicRoute() {
    return {};
  }
}

const healthCheck = createHttpHandler({ path: "/health", method: "GET" }, () => ({
  status: "ok",
}));

@Module({
  controllers: [OrdersHandler, AuthGuardHandler, MixedGuardsHandler],
  functionHandlers: [healthCheck],
})
class TestAppModule {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_FILE = "/project/src/app.module.ts";
const OPTIONS = { projectRoot: "/project" };

function findEntry(manifest: HandlerManifest, methodName: string): ClassHandlerEntry | undefined {
  return manifest.handlers.find((h) => h.methodName === methodName);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("serializeManifest", () => {
  it("produces a manifest with version 1.0.0", () => {
    const scanned = buildScannedModule(TestAppModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(manifest.version).toBe("1.0.0");
  });

  it("serializes class-based handlers with correct structure", () => {
    const scanned = buildScannedModule(TestAppModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const getOrder = findEntry(manifest, "getOrder");
    expect(getOrder).toBeDefined();
    expect(getOrder!.className).toBe("OrdersHandler");
    expect(getOrder!.handlerType).toBe("http");
    expect(getOrder!.sourceFile).toBe(SOURCE_FILE);
  });

  it("derives correct resource name", () => {
    const scanned = buildScannedModule(TestAppModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const getOrder = findEntry(manifest, "getOrder");
    expect(getOrder!.resourceName).toBe("ordersHandler_getOrder");
  });

  it("derives correct spec fields", () => {
    const scanned = buildScannedModule(TestAppModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const getOrder = findEntry(manifest, "getOrder");
    expect(getOrder!.spec.handlerName).toBe("OrdersHandler-getOrder");
    expect(getOrder!.spec.codeLocation).toBe("./src");
    expect(getOrder!.spec.handler).toBe("app.module.OrdersHandler.getOrder");
  });

  it("produces correct HTTP method and path annotations", () => {
    const scanned = buildScannedModule(TestAppModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const getOrder = findEntry(manifest, "getOrder");
    expect(getOrder!.annotations["celerity.handler.http"]).toBe(true);
    expect(getOrder!.annotations["celerity.handler.http.method"]).toBe("GET");
    expect(getOrder!.annotations["celerity.handler.http.path"]).toBe("/orders/{orderId}");

    const createOrder = findEntry(manifest, "createOrder");
    expect(createOrder!.annotations["celerity.handler.http.method"]).toBe("POST");
    expect(createOrder!.annotations["celerity.handler.http.path"]).toBe("/orders");
  });

  describe("guard annotations", () => {
    it("extracts class-level @ProtectedBy into annotations", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const getOrder = findEntry(manifest, "getOrder");
      expect(getOrder!.annotations["celerity.handler.guard.protectedBy"]).toEqual(["jwt"]);
    });

    it("extracts @Guard custom guard name into annotations", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const validate = findEntry(manifest, "validate");
      expect(validate!.annotations["celerity.handler.guard.custom"]).toBe("myCustomAuth");
    });

    it("extracts @Public into annotations", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const publicDelete = findEntry(manifest, "publicDelete");
      expect(publicDelete!.annotations["celerity.handler.public"]).toBe(true);
    });

    it("merges class-level and method-level @ProtectedBy", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const admin = findEntry(manifest, "adminRoute");
      // MixedGuardsHandler has no class-level @ProtectedBy, but method has ["jwt", "rbac"]
      expect(admin!.annotations["celerity.handler.guard.protectedBy"]).toEqual(["jwt", "rbac"]);
    });

    it("does not include guard annotations when not present", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const publicRoute = findEntry(manifest, "publicRoute");
      expect(publicRoute!.annotations).not.toHaveProperty("celerity.handler.guard.protectedBy");
      expect(publicRoute!.annotations["celerity.handler.public"]).toBe(true);
    });
  });

  describe("function handlers", () => {
    it("serializes function handlers with identity and routing annotations", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.functionHandlers).toHaveLength(1);
      const fn = manifest.functionHandlers[0];
      expect(fn.sourceFile).toBe(SOURCE_FILE);
      expect(fn.handlerType).toBe("http");
      expect(fn.spec.codeLocation).toBe("./src");
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.http"]).toBe(true);
      expect(fn.annotations!["celerity.handler.http.method"]).toBe("GET");
      expect(fn.annotations!["celerity.handler.http.path"]).toBe("/health");
    });

    it("omits routing annotations when path/method not specified (blueprint-first)", () => {
      const blueprintFirst = createHttpHandler({}, () => ({ ok: true }));

      @Module({ functionHandlers: [blueprintFirst] })
      class BlueprintModule {}

      const scanned = buildScannedModule(BlueprintModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.handlerType).toBe("http");
      expect(fn).not.toHaveProperty("annotations");
    });
  });

  describe("custom metadata annotations", () => {
    it("serializes @Action into celerity.handler.metadata.action annotation", () => {
      @Controller("/actions")
      class ActionsHandler {
        @Get("/")
        @Action("items:read")
        list() {
          return {};
        }
      }

      @Module({ controllers: [ActionsHandler] })
      class ActionModule {}

      const scanned = buildScannedModule(ActionModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.metadata.action"]).toBe("items:read");
    });

    it("serializes boolean metadata values as booleans", () => {
      @Controller("/flags")
      class FlagsHandler {
        @Get("/")
        @SetMetadata("cacheable", true)
        list() {
          return {};
        }
      }

      @Module({ controllers: [FlagsHandler] })
      class FlagsModule {}

      const scanned = buildScannedModule(FlagsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers[0].annotations["celerity.handler.metadata.cacheable"]).toBe(true);
    });

    it("serializes string array values as string arrays", () => {
      @Controller("/perms")
      class PermsHandler {
        @Get("/")
        @SetMetadata("permissions", ["read", "write"])
        list() {
          return {};
        }
      }

      @Module({ controllers: [PermsHandler] })
      class PermsModule {}

      const scanned = buildScannedModule(PermsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers[0].annotations["celerity.handler.metadata.permissions"]).toEqual([
        "read",
        "write",
      ]);
    });

    it("JSON-stringifies object values", () => {
      @Controller("/obj")
      class ObjHandler {
        @Get("/")
        @SetMetadata("config", { timeout: 30, retry: true })
        list() {
          return {};
        }
      }

      @Module({ controllers: [ObjHandler] })
      class ObjModule {}

      const scanned = buildScannedModule(ObjModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers[0].annotations["celerity.handler.metadata.config"]).toBe(
        JSON.stringify({ timeout: 30, retry: true }),
      );
    });

    it("merges class-level and method-level custom metadata", () => {
      @Controller("/merged")
      @SetMetadata("resource", "orders")
      class MergedHandler {
        @Get("/")
        @Action("orders:read")
        list() {
          return {};
        }
      }

      @Module({ controllers: [MergedHandler] })
      class MergedModule {}

      const scanned = buildScannedModule(MergedModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.metadata.resource"]).toBe("orders");
      expect(entry.annotations["celerity.handler.metadata.action"]).toBe("orders:read");
    });

    it("serializes function handler custom metadata into annotations", () => {
      const fnWithMeta = createHttpHandler(
        {
          path: "/fn/meta",
          method: "GET",
          metadata: { action: "fn:read", cacheable: true },
        },
        () => ({ ok: true }),
      );

      @Module({ functionHandlers: [fnWithMeta] })
      class FnMetaModule {}

      const scanned = buildScannedModule(FnMetaModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.metadata.action"]).toBe("fn:read");
      expect(fn.annotations!["celerity.handler.metadata.cacheable"]).toBe(true);
    });

    it("includes only routing annotations when no custom metadata", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.annotations).toBeDefined();
      // Only routing annotations, no custom metadata annotations
      const keys = Object.keys(fn.annotations!);
      expect(keys.every((k) => k.startsWith("celerity.handler.http"))).toBe(true);
    });
  });

  describe("resource ref annotations", () => {
    it("extracts class-level @UseResource into celerity.handler.resource.ref annotation", () => {
      @Controller("/storage")
      @UseResource("filesBucket")
      class StorageHandler {
        @Get("/{fileId}")
        getFile() {
          return {};
        }
      }

      @Module({ controllers: [StorageHandler] })
      class StorageModule {}

      const scanned = buildScannedModule(StorageModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.resource.ref"]).toEqual(["filesBucket"]);
    });

    it("extracts method-level @UseResource into annotation", () => {
      @Controller("/storage")
      class StorageHandler {
        @Get("/{fileId}")
        @UseResource("filesBucket")
        getFile() {
          return {};
        }

        @Post("/")
        uploadFile() {
          return {};
        }
      }

      @Module({ controllers: [StorageHandler] })
      class StorageModule {}

      const scanned = buildScannedModule(StorageModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const getFile = findEntry(manifest, "getFile");
      expect(getFile!.annotations["celerity.handler.resource.ref"]).toEqual(["filesBucket"]);

      const upload = findEntry(manifest, "uploadFile");
      expect(upload!.annotations).not.toHaveProperty("celerity.handler.resource.ref");
    });

    it("merges class-level and method-level @UseResource (union)", () => {
      @Controller("/storage")
      @UseResource("filesBucket")
      class StorageHandler {
        @Get("/{fileId}")
        @UseResource("filesCache")
        getFile() {
          return {};
        }
      }

      @Module({ controllers: [StorageHandler] })
      class StorageModule {}

      const scanned = buildScannedModule(StorageModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.resource.ref"]).toEqual([
        "filesBucket",
        "filesCache",
      ]);
    });

    it("deduplicates when same name at class and method level", () => {
      @Controller("/storage")
      @UseResource("filesBucket")
      class StorageHandler {
        @Get("/{fileId}")
        @UseResource("filesBucket")
        getFile() {
          return {};
        }
      }

      @Module({ controllers: [StorageHandler] })
      class StorageModule {}

      const scanned = buildScannedModule(StorageModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.resource.ref"]).toEqual(["filesBucket"]);
    });

    it("does not include resource.ref annotation when no @UseResource is present", () => {
      const scanned = buildScannedModule(TestAppModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const getOrder = findEntry(manifest, "getOrder");
      expect(getOrder!.annotations).not.toHaveProperty("celerity.handler.resource.ref");
    });

    it("handles variadic @UseResource with multiple args", () => {
      @Controller("/storage")
      @UseResource("filesBucket", "filesQueue", "filesCache")
      class StorageHandler {
        @Get("/")
        listFiles() {
          return {};
        }
      }

      @Module({ controllers: [StorageHandler] })
      class StorageModule {}

      const scanned = buildScannedModule(StorageModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.resource.ref"]).toEqual([
        "filesBucket",
        "filesQueue",
        "filesCache",
      ]);
    });
  });

  describe("websocket class handlers", () => {
    it("serializes @WebSocketController with @OnConnect, @OnMessage, @OnDisconnect", () => {
      @WebSocketController()
      class ChatHandler {
        @OnConnect()
        connect() {
          return {};
        }

        @OnMessage()
        message() {
          return {};
        }

        @OnDisconnect()
        disconnect() {
          return {};
        }
      }

      @Module({ controllers: [ChatHandler] })
      class WsModule {}

      const scanned = buildScannedModule(WsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers).toHaveLength(3);

      const connect = findEntry(manifest, "connect");
      expect(connect).toBeDefined();
      expect(connect!.handlerType).toBe("websocket");
      expect(connect!.annotations["celerity.handler.websocket"]).toBe(true);
      expect(connect!.annotations["celerity.handler.websocket.eventType"]).toBe("connect");
      expect(connect!.annotations["celerity.handler.websocket.route"]).toBe("$connect");

      const message = findEntry(manifest, "message");
      expect(message!.handlerType).toBe("websocket");
      expect(message!.annotations["celerity.handler.websocket.eventType"]).toBe("message");
      expect(message!.annotations["celerity.handler.websocket.route"]).toBe("$default");

      const disconnect = findEntry(manifest, "disconnect");
      expect(disconnect!.handlerType).toBe("websocket");
      expect(disconnect!.annotations["celerity.handler.websocket.eventType"]).toBe("disconnect");
      expect(disconnect!.annotations["celerity.handler.websocket.route"]).toBe("$disconnect");
    });

    it("extracts custom route from @OnMessage(route)", () => {
      @WebSocketController()
      class CustomRouteHandler {
        @OnMessage("chat")
        chatMessage() {
          return {};
        }
      }

      @Module({ controllers: [CustomRouteHandler] })
      class WsModule {}

      const scanned = buildScannedModule(WsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.websocket.route"]).toBe("chat");
    });

    it("includes guards and custom metadata on websocket handlers", () => {
      @WebSocketController()
      @ProtectedBy("jwt")
      class SecureWsHandler {
        @OnConnect()
        @SetMetadata("rateLimit", 100)
        connect() {
          return {};
        }
      }

      @Module({ controllers: [SecureWsHandler] })
      class WsModule {}

      const scanned = buildScannedModule(WsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.guard.protectedBy"]).toEqual(["jwt"]);
      expect(entry.annotations["celerity.handler.metadata.rateLimit"]).toBe("100");
    });

    it("derives correct spec fields for websocket handler", () => {
      @WebSocketController()
      class WsHandler {
        @OnMessage()
        handleMsg() {
          return {};
        }
      }

      @Module({ controllers: [WsHandler] })
      class WsModule {}

      const scanned = buildScannedModule(WsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.className).toBe("WsHandler");
      expect(entry.methodName).toBe("handleMsg");
      expect(entry.resourceName).toBe("wsHandler_handleMsg");
      expect(entry.spec.handlerName).toBe("WsHandler-handleMsg");
      expect(entry.spec.handler).toBe("app.module.WsHandler.handleMsg");
    });
  });

  describe("consumer class handlers", () => {
    it("serializes @Consumer with @MessageHandler", () => {
      @Consumer("orders")
      class OrderConsumer {
        @MessageHandler()
        processOrder() {
          return {};
        }
      }

      @Module({ controllers: [OrderConsumer] })
      class ConsumerModule {}

      const scanned = buildScannedModule(ConsumerModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers).toHaveLength(1);
      const entry = manifest.handlers[0];
      expect(entry.handlerType).toBe("consumer");
      expect(entry.annotations["celerity.handler.consumer"]).toBe(true);
      expect(entry.annotations["celerity.handler.consumer.source"]).toBe("orders");
    });

    it("extracts route from @MessageHandler(route)", () => {
      @Consumer()
      class MultiConsumer {
        @MessageHandler("process")
        processMsg() {
          return {};
        }

        @MessageHandler("dlq")
        deadLetter() {
          return {};
        }
      }

      @Module({ controllers: [MultiConsumer] })
      class ConsumerModule {}

      const scanned = buildScannedModule(ConsumerModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      expect(manifest.handlers).toHaveLength(2);

      const process = findEntry(manifest, "processMsg");
      expect(process!.annotations["celerity.handler.consumer.route"]).toBe("process");

      const dlq = findEntry(manifest, "deadLetter");
      expect(dlq!.annotations["celerity.handler.consumer.route"]).toBe("dlq");
    });

    it("omits source when not provided to @Consumer()", () => {
      @Consumer()
      class NoSourceConsumer {
        @MessageHandler()
        handle() {
          return {};
        }
      }

      @Module({ controllers: [NoSourceConsumer] })
      class ConsumerModule {}

      const scanned = buildScannedModule(ConsumerModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.consumer"]).toBe(true);
      expect(entry.annotations).not.toHaveProperty("celerity.handler.consumer.source");
    });

    it("includes guards on consumer handlers", () => {
      @Consumer("orders")
      @ProtectedBy("apiKey")
      class SecureConsumer {
        @MessageHandler()
        handle() {
          return {};
        }
      }

      @Module({ controllers: [SecureConsumer] })
      class ConsumerModule {}

      const scanned = buildScannedModule(ConsumerModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers[0];
      expect(entry.annotations["celerity.handler.guard.protectedBy"]).toEqual(["apiKey"]);
    });
  });

  describe("schedule class handlers (cross-cutting)", () => {
    it("serializes @ScheduleHandler on @Controller method", () => {
      @Controller("/admin")
      class AdminHandler {
        @ScheduleHandler("daily-cleanup")
        cleanup() {
          return {};
        }
      }

      @Module({ controllers: [AdminHandler] })
      class ScheduleModule {}

      const scanned = buildScannedModule(ScheduleModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const scheduleEntries = manifest.handlers.filter((h) => h.handlerType === "schedule");
      expect(scheduleEntries).toHaveLength(1);

      const entry = scheduleEntries[0];
      expect(entry.annotations["celerity.handler.schedule"]).toBe(true);
      expect(entry.annotations["celerity.handler.schedule.source"]).toBe("daily-cleanup");
    });

    it("serializes schedule expression", () => {
      @Controller("/tasks")
      class TaskHandler {
        @ScheduleHandler("rate(1 day)")
        dailyTask() {
          return {};
        }
      }

      @Module({ controllers: [TaskHandler] })
      class ScheduleModule {}

      const scanned = buildScannedModule(ScheduleModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers.find((h) => h.handlerType === "schedule");
      expect(entry).toBeDefined();
      expect(entry!.annotations["celerity.handler.schedule.expression"]).toBe("rate(1 day)");
    });

    it("produces both HTTP and schedule entries for mixed controller", () => {
      @Controller("/mixed")
      class MixedController {
        @Get("/status")
        getStatus() {
          return {};
        }

        @ScheduleHandler("hourly-sync")
        syncData() {
          return {};
        }
      }

      @Module({ controllers: [MixedController] })
      class MixedModule {}

      const scanned = buildScannedModule(MixedModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const httpEntries = manifest.handlers.filter((h) => h.handlerType === "http");
      const scheduleEntries = manifest.handlers.filter((h) => h.handlerType === "schedule");

      expect(httpEntries).toHaveLength(1);
      expect(httpEntries[0].methodName).toBe("getStatus");

      expect(scheduleEntries).toHaveLength(1);
      expect(scheduleEntries[0].methodName).toBe("syncData");
    });

    it("cross-cutting: @ScheduleHandler on @Consumer method", () => {
      @Consumer("events")
      class EventProcessor {
        @MessageHandler()
        processEvent() {
          return {};
        }

        @ScheduleHandler("cleanup-old-events")
        cleanupOldEvents() {
          return {};
        }
      }

      @Module({ controllers: [EventProcessor] })
      class CrossCutModule {}

      const scanned = buildScannedModule(CrossCutModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const consumerEntries = manifest.handlers.filter((h) => h.handlerType === "consumer");
      const scheduleEntries = manifest.handlers.filter((h) => h.handlerType === "schedule");

      expect(consumerEntries).toHaveLength(1);
      expect(scheduleEntries).toHaveLength(1);
      expect(scheduleEntries[0].methodName).toBe("cleanupOldEvents");
    });

    it("includes guards on schedule handlers", () => {
      @Controller("/admin")
      @ProtectedBy("internal")
      class AdminHandler {
        @ScheduleHandler("cleanup")
        cleanup() {
          return {};
        }
      }

      @Module({ controllers: [AdminHandler] })
      class ScheduleModule {}

      const scanned = buildScannedModule(ScheduleModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers.find((h) => h.handlerType === "schedule");
      expect(entry!.annotations["celerity.handler.guard.protectedBy"]).toEqual(["internal"]);
    });
  });

  describe("custom class handlers (cross-cutting)", () => {
    it("serializes @Invoke on @Controller method", () => {
      @Controller("/payments")
      class PaymentHandler {
        @Invoke("processPayment")
        process() {
          return {};
        }
      }

      @Module({ controllers: [PaymentHandler] })
      class CustomModule {}

      const scanned = buildScannedModule(CustomModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const customEntries = manifest.handlers.filter((h) => h.handlerType === "custom");
      expect(customEntries).toHaveLength(1);

      const entry = customEntries[0];
      expect(entry.annotations["celerity.handler.custom"]).toBe(true);
      expect(entry.annotations["celerity.handler.custom.name"]).toBe("processPayment");
    });

    it("cross-cutting: @Invoke on @WebSocketController method", () => {
      @WebSocketController()
      class WsHandler {
        @OnMessage()
        handleMsg() {
          return {};
        }

        @Invoke("broadcastStatus")
        broadcast() {
          return {};
        }
      }

      @Module({ controllers: [WsHandler] })
      class CrossCutModule {}

      const scanned = buildScannedModule(CrossCutModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const wsEntries = manifest.handlers.filter((h) => h.handlerType === "websocket");
      const customEntries = manifest.handlers.filter((h) => h.handlerType === "custom");

      expect(wsEntries).toHaveLength(1);
      expect(customEntries).toHaveLength(1);
      expect(customEntries[0].annotations["celerity.handler.custom.name"]).toBe("broadcastStatus");
    });

    it("includes shared annotations on custom handlers", () => {
      @Controller("/rpc")
      @ProtectedBy("jwt")
      @UseResource("paymentQueue")
      class RpcHandler {
        @Invoke("doWork")
        @Public()
        @SetMetadata("priority", "high")
        doWork() {
          return {};
        }
      }

      @Module({ controllers: [RpcHandler] })
      class CustomModule {}

      const scanned = buildScannedModule(CustomModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const entry = manifest.handlers.find((h) => h.handlerType === "custom");
      expect(entry).toBeDefined();
      expect(entry!.annotations["celerity.handler.public"]).toBe(true);
      expect(entry!.annotations["celerity.handler.metadata.priority"]).toBe("high");
      expect(entry!.annotations["celerity.handler.resource.ref"]).toEqual(["paymentQueue"]);
    });
  });

  describe("function handlers — all types", () => {
    it("serializes websocket function handler", () => {
      const wsHandler = createWebSocketHandler(
        { route: "chat" },
        async () => {},
      );

      @Module({ functionHandlers: [wsHandler] })
      class WsModule {}

      const scanned = buildScannedModule(WsModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.handlerType).toBe("websocket");
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.websocket"]).toBe(true);
      expect(fn.annotations!["celerity.handler.websocket.route"]).toBe("chat");
    });

    it("serializes consumer function handler", () => {
      const consumerHandler = createConsumerHandler(
        { route: "process-orders" },
        async () => ({ success: true }),
      );

      @Module({ functionHandlers: [consumerHandler] })
      class ConsumerModule {}

      const scanned = buildScannedModule(ConsumerModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.handlerType).toBe("consumer");
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.consumer"]).toBe(true);
      expect(fn.annotations!["celerity.handler.consumer.route"]).toBe("process-orders");
    });

    it("serializes schedule function handler with source", () => {
      const scheduleHandler = createScheduleHandler(
        "daily-cleanup",
        {},
        async () => ({ success: true }),
      );

      @Module({ functionHandlers: [scheduleHandler] })
      class ScheduleModule {}

      const scanned = buildScannedModule(ScheduleModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.handlerType).toBe("schedule");
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.schedule"]).toBe(true);
      expect(fn.annotations!["celerity.handler.schedule.source"]).toBe("daily-cleanup");
    });

    it("serializes schedule function handler with expression", () => {
      const scheduleHandler = createScheduleHandler(
        "rate(1 hour)",
        {},
        async () => ({ success: true }),
      );

      @Module({ functionHandlers: [scheduleHandler] })
      class ScheduleModule {}

      const scanned = buildScannedModule(ScheduleModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.annotations!["celerity.handler.schedule.expression"]).toBe("rate(1 hour)");
    });

    it("serializes custom function handler", () => {
      const customHandler = createCustomHandler(
        { name: "processPayment" },
        async () => ({ result: "ok" }),
      );

      @Module({ functionHandlers: [customHandler] })
      class CustomModule {}

      const scanned = buildScannedModule(CustomModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.handlerType).toBe("custom");
      expect(fn.annotations).toBeDefined();
      expect(fn.annotations!["celerity.handler.custom"]).toBe(true);
      expect(fn.annotations!["celerity.handler.custom.name"]).toBe("processPayment");
    });

    it("omits type-specific annotations when not provided (blueprint-first)", () => {
      const wsHandler = createWebSocketHandler({}, async () => {});
      const consumerHandler = createConsumerHandler({}, async () => ({ success: true }));
      const scheduleHandler = createScheduleHandler({}, async () => ({ success: true }));
      const customHandler = createCustomHandler({}, async () => ({}));

      @Module({
        functionHandlers: [wsHandler, consumerHandler, scheduleHandler, customHandler],
      })
      class BlueprintModule {}

      const scanned = buildScannedModule(BlueprintModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      // WebSocket — still has marker annotation
      const ws = manifest.functionHandlers.find((h) => h.handlerType === "websocket");
      expect(ws!.annotations!["celerity.handler.websocket"]).toBe(true);
      expect(ws!.annotations).not.toHaveProperty("celerity.handler.websocket.route");

      // Consumer — still has marker annotation
      const consumer = manifest.functionHandlers.find((h) => h.handlerType === "consumer");
      expect(consumer!.annotations!["celerity.handler.consumer"]).toBe(true);
      expect(consumer!.annotations).not.toHaveProperty("celerity.handler.consumer.route");

      // Schedule — still has marker annotation
      const schedule = manifest.functionHandlers.find((h) => h.handlerType === "schedule");
      expect(schedule!.annotations!["celerity.handler.schedule"]).toBe(true);
      expect(schedule!.annotations).not.toHaveProperty("celerity.handler.schedule.source");

      // Custom — still has marker annotation
      const custom = manifest.functionHandlers.find((h) => h.handlerType === "custom");
      expect(custom!.annotations!["celerity.handler.custom"]).toBe(true);
      expect(custom!.annotations).not.toHaveProperty("celerity.handler.custom.name");
    });

    it("includes custom metadata on non-HTTP function handlers", () => {
      const handler = createConsumerHandler(
        { route: "orders", metadata: { priority: "high", retryable: true } },
        async () => ({ success: true }),
      );

      @Module({ functionHandlers: [handler] })
      class MetaModule {}

      const scanned = buildScannedModule(MetaModule);
      const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

      const fn = manifest.functionHandlers[0];
      expect(fn.annotations!["celerity.handler.metadata.priority"]).toBe("high");
      expect(fn.annotations!["celerity.handler.metadata.retryable"]).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty arrays when no handlers are found", () => {
      @Module({})
      class EmptyModule {}

      const scanned = buildScannedModule(EmptyModule);
      const manifest = serializeManifest(scanned, "/project/src/empty.ts", OPTIONS);

      expect(manifest.handlers).toEqual([]);
      expect(manifest.functionHandlers).toEqual([]);
    });

    it("skips methods without HTTP decorators", () => {
      @Controller("/test")
      class TestHandler {
        @Get("/decorated")
        decorated() {
          return {};
        }

        // No @Get/@Post/etc
        undecorated() {
          return {};
        }
      }

      @Module({ controllers: [TestHandler] })
      class TestModule {}

      const scanned = buildScannedModule(TestModule);
      const manifest = serializeManifest(scanned, "/project/src/test.ts", OPTIONS);

      expect(manifest.handlers).toHaveLength(1);
      expect(manifest.handlers[0].methodName).toBe("decorated");
    });

    it("skips classes without @Controller metadata", () => {
      class PlainClass {
        @Get("/oops")
        method() {
          return {};
        }
      }

      @Module({ controllers: [PlainClass] })
      class TestModule {}

      const scanned = buildScannedModule(TestModule);
      const manifest = serializeManifest(scanned, "/project/src/test.ts", OPTIONS);

      expect(manifest.handlers).toEqual([]);
    });
  });
});

describe("dependency graph serialization", () => {
  class MyService {}
  class DepService {}

  it("includes dependencyGraph in manifest output", () => {
    const providers: ScannedProvider[] = [
      { token: MyService, providerType: "class", dependencies: [] },
    ];
    const scanned = {
      controllerClasses: [],
      functionHandlers: [],
      guardClasses: [],
      functionGuards: [],
      providers,
    };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(manifest.dependencyGraph).toBeDefined();
    expect(manifest.dependencyGraph.nodes).toBeInstanceOf(Array);
    expect(manifest.dependencyGraph.nodes).toHaveLength(1);
  });

  it("serializes class token as class name", () => {
    const providers: ScannedProvider[] = [
      { token: MyService, providerType: "class", dependencies: [] },
    ];
    const scanned = {
      controllerClasses: [],
      functionHandlers: [],
      guardClasses: [],
      functionGuards: [],
      providers,
    };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.token).toBe("MyService");
    expect(node.tokenType).toBe("class");
  });

  it("serializes string token", () => {
    const providers: ScannedProvider[] = [
      { token: "API_KEY", providerType: "value", dependencies: [] },
    ];
    const scanned = {
      controllerClasses: [],
      functionHandlers: [],
      guardClasses: [],
      functionGuards: [],
      providers,
    };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.token).toBe("API_KEY");
    expect(node.tokenType).toBe("string");
  });

  it("serializes dependencies as token strings", () => {
    const providers: ScannedProvider[] = [
      { token: MyService, providerType: "class", dependencies: [DepService, "CONFIG"] },
    ];
    const scanned = {
      controllerClasses: [],
      functionHandlers: [],
      guardClasses: [],
      functionGuards: [],
      providers,
    };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.dependencies).toContain("DepService");
    expect(node.dependencies).toContain("CONFIG");
  });
});
