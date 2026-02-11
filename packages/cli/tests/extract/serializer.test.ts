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
  createHttpHandler,
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
    const scanned = { controllerClasses: [], functionHandlers: [], providers };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(manifest.dependencyGraph).toBeDefined();
    expect(manifest.dependencyGraph.nodes).toBeInstanceOf(Array);
    expect(manifest.dependencyGraph.nodes).toHaveLength(1);
  });

  it("serializes class token as class name", () => {
    const providers: ScannedProvider[] = [
      { token: MyService, providerType: "class", dependencies: [] },
    ];
    const scanned = { controllerClasses: [], functionHandlers: [], providers };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.token).toBe("MyService");
    expect(node.tokenType).toBe("class");
  });

  it("serializes string token", () => {
    const providers: ScannedProvider[] = [
      { token: "API_KEY", providerType: "value", dependencies: [] },
    ];
    const scanned = { controllerClasses: [], functionHandlers: [], providers };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.token).toBe("API_KEY");
    expect(node.tokenType).toBe("string");
  });

  it("serializes dependencies as token strings", () => {
    const providers: ScannedProvider[] = [
      { token: MyService, providerType: "class", dependencies: [DepService, "CONFIG"] },
    ];
    const scanned = { controllerClasses: [], functionHandlers: [], providers };
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    const node = manifest.dependencyGraph.nodes[0];
    expect(node.dependencies).toContain("DepService");
    expect(node.dependencies).toContain("CONFIG");
  });
});
