import "reflect-metadata";
import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
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
import schema from "../../schemas/handler-manifest.v1.schema.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const SOURCE_FILE = "/project/src/app.module.ts";
const OPTIONS = { projectRoot: "/project" };

let validate: ReturnType<InstanceType<typeof Ajv2020>["compile"]>;

beforeAll(() => {
  const ajv = new Ajv2020({ strict: true });
  validate = ajv.compile(schema);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handler manifest JSON schema validation", () => {
  it("schema compiles without errors", () => {
    expect(validate).toBeDefined();
    expect(typeof validate).toBe("function");
  });

  it("validates a manifest with class handlers and guards", () => {
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

    @Module({ controllers: [OrdersHandler] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates a manifest with custom guard name", () => {
    @Guard("myAuth")
    @Controller("/auth")
    class AuthHandler {
      @Post("/validate")
      validate() {
        return {};
      }
    }

    @Module({ controllers: [AuthHandler] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates a manifest with custom metadata annotations", () => {
    @Controller("/items")
    @SetMetadata("resource", "items")
    class ItemsHandler {
      @Get("/")
      @Action("items:list")
      @SetMetadata("cacheable", true)
      @SetMetadata("permissions", ["items:read", "items:list"])
      list() {
        return {};
      }

      @Get("/{id}")
      @Action("items:read")
      @SetMetadata("config", { timeout: 30, retry: true })
      getItem() {
        return {};
      }
    }

    @Module({ controllers: [ItemsHandler] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates a manifest with function handlers (no annotations)", () => {
    const health = createHttpHandler({ path: "/health", method: "GET" }, () => ({
      status: "ok",
    }));

    @Module({ functionHandlers: [health] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates a manifest with function handlers with annotations", () => {
    const fn = createHttpHandler(
      {
        path: "/fn",
        method: "GET",
        metadata: { action: "fn:read", cacheable: true },
      },
      () => ({ ok: true }),
    );

    @Module({ functionHandlers: [fn] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates a mixed manifest with both handler types", () => {
    @Controller("/api")
    @ProtectedBy("jwt")
    class ApiHandler {
      @Get("/data")
      @Action("data:read")
      getData() {
        return {};
      }
    }

    const health = createHttpHandler({ path: "/health", method: "GET" }, () => ({
      status: "ok",
    }));

    const metrics = createHttpHandler(
      {
        path: "/metrics",
        method: "GET",
        metadata: { action: "metrics:read" },
      },
      () => ({ uptime: 0 }),
    );

    @Module({
      controllers: [ApiHandler],
      functionHandlers: [health, metrics],
    })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("validates an empty manifest", () => {
    @Module({})
    class EmptyModule {}

    const scanned = buildScannedModule(EmptyModule);
    const manifest = serializeManifest(scanned, SOURCE_FILE, OPTIONS);

    expect(validate(manifest)).toBe(true);
    if (!validate(manifest)) {
      expect.fail(JSON.stringify(validate.errors, null, 2));
    }
  });

  it("rejects a manifest with an invalid version", () => {
    const invalid = { version: "2.0.0", handlers: [], functionHandlers: [], dependencyGraph: { nodes: [] } };
    expect(validate(invalid)).toBe(false);
  });

  it("rejects a manifest with an invalid handler type", () => {
    const invalid = {
      version: "1.0.0",
      handlers: [
        {
          resourceName: "test_method",
          className: "Test",
          methodName: "method",
          sourceFile: "/test.ts",
          handlerType: "grpc",
          annotations: {},
          spec: {
            handlerName: "Test-method",
            codeLocation: "./src",
            handler: "test.Test.method",
          },
        },
      ],
      functionHandlers: [],
      dependencyGraph: { nodes: [] },
    };
    expect(validate(invalid)).toBe(false);
  });

  it("rejects a manifest with an invalid annotation value type", () => {
    const invalid = {
      version: "1.0.0",
      handlers: [
        {
          resourceName: "test_method",
          className: "Test",
          methodName: "method",
          sourceFile: "/test.ts",
          handlerType: "http",
          annotations: { "celerity.handler.http": 42 },
          spec: {
            handlerName: "Test-method",
            codeLocation: "./src",
            handler: "test.Test.method",
          },
        },
      ],
      functionHandlers: [],
      dependencyGraph: { nodes: [] },
    };
    expect(validate(invalid)).toBe(false);
  });
});
