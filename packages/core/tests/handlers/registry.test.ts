import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandlerRegistry } from "../../src/handlers/registry";
import { Container } from "../../src/di/container";
import { Controller } from "../../src/decorators/controller";
import { Get, Post, Delete } from "../../src/decorators/http";
import { Body, Param, Query, Headers } from "../../src/decorators/params";
import { ProtectedBy, Public } from "../../src/decorators/guards";
import { UseLayer } from "../../src/decorators/layer";
import { SetMetadata, Action } from "../../src/decorators/metadata";
import { Module } from "../../src/decorators/module";
import type {
  CelerityLayer,
  HandlerContext,
  HandlerResponse,
  FunctionHandlerDefinition,
} from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Test fixtures — decorated handler classes
// ---------------------------------------------------------------------------

@Controller("/users")
class UserHandler {
  @Get("/")
  findAll() {
    return [{ id: 1 }];
  }

  @Get("/{id}")
  findOne(@Param("id") id: string) {
    return { id };
  }

  @Post("/")
  create(@Body() body: unknown) {
    return body;
  }
}

@Controller("/items")
class ItemHandler {
  @Get("/")
  list(@Query("page") page: string) {
    return { page };
  }

  @Delete("/{id}")
  remove(@Param("id") id: string) {
    return { deleted: id };
  }
}

class LoggingLayer implements CelerityLayer {
  async handle(
    _ctx: HandlerContext,
    next: () => Promise<HandlerResponse>,
  ): Promise<HandlerResponse> {
    return next();
  }
}

@Controller("/protected")
@ProtectedBy("jwt")
@UseLayer(LoggingLayer)
class ProtectedHandler {
  @Get("/secret")
  secret() {
    return { secret: true };
  }

  @Public()
  @Get("/open")
  open() {
    return { open: true };
  }
}

@Module({
  controllers: [UserHandler],
})
class UserModule {}

@Module({
  controllers: [ItemHandler],
  imports: [UserModule],
})
class AppModule {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandlerRegistry", () => {
  let registry: HandlerRegistry;
  let container: Container;

  beforeEach(() => {
    registry = new HandlerRegistry();
    container = new Container();
  });

  describe("scanModule — class handlers", () => {
    it("registers all decorated methods from a simple module", async () => {
      // Arrange
      @Module({ controllers: [UserHandler] })
      class SimpleModule {}

      // Act
      await registry.scanModule(SimpleModule, container);

      // Assert
      const handlers = registry.getAllHandlers();
      expect(handlers).toHaveLength(3);

      const paths = handlers.map((h) => `${h.method} ${h.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("GET /users/{id}");
      expect(paths).toContain("POST /users");
    });

    it("registers handlers from imported sub-modules", async () => {
      // Act
      await registry.scanModule(AppModule, container);

      // Assert
      const handlers = registry.getAllHandlers();
      // UserModule (3 routes) + ItemHandler (2 routes)
      expect(handlers).toHaveLength(5);

      const paths = handlers.map((h) => `${h.method} ${h.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("GET /items");
      expect(paths).toContain("DELETE /items/{id}");
    });

    it("stores param metadata on registered handlers", async () => {
      // Arrange
      @Module({ controllers: [UserHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const findOne = registry.getHandler("/users/42", "GET");
      expect(findOne).toBeDefined();
      // The :id route should have param metadata
      expect(findOne!.paramMetadata.length).toBeGreaterThanOrEqual(1);
      expect(findOne!.paramMetadata[0].type).toBe("param");
      expect(findOne!.paramMetadata[0].key).toBe("id");
    });

    it("merges class-level protectedBy and method-level layers", async () => {
      // Arrange
      @Module({ controllers: [ProtectedHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const secret = registry.getHandler("/protected/secret", "GET");
      expect(secret).toBeDefined();
      expect(secret!.protectedBy).toEqual(["jwt"]);
      expect(secret!.layers).toHaveLength(1);
    });

    it("marks methods decorated with @Public() as isPublic", async () => {
      // Arrange
      @Module({ controllers: [ProtectedHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const open = registry.getHandler("/protected/open", "GET");
      expect(open).toBeDefined();
      expect(open!.isPublic).toBe(true);

      const secret = registry.getHandler("/protected/secret", "GET");
      expect(secret).toBeDefined();
      expect(secret!.isPublic).toBe(false);
    });

    it("does not register classes that lack @Controller decorator", async () => {
      // Arrange
      class PlainClass {
        doSomething() {
          return "nope";
        }
      }

      // A class with no handler metadata — scanModule should skip it silently
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      @Module({ controllers: [PlainClass as any] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      expect(registry.getAllHandlers()).toHaveLength(0);
    });

    it("ignores classes without module metadata entirely", async () => {
      // Arrange
      class NotAModule {}

      // Act
      await registry.scanModule(NotAModule, container);

      // Assert
      expect(registry.getAllHandlers()).toHaveLength(0);
    });
  });

  describe("scanModule — function handlers", () => {
    it("registers function handler definitions from module metadata", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/fn/hello",
          method: "GET",
          layers: [],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handlers = registry.getAllHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0].path).toBe("/fn/hello");
      expect(handlers[0].method).toBe("GET");
      expect(handlers[0].isFunctionHandler).toBe(true);
    });

    it("leaves path and method undefined when not specified (blueprint-first)", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const h = registry.getAllHandlers()[0];
      expect(h.path).toBeUndefined();
      expect(h.method).toBeUndefined();
    });

    it("skips non-http function handlers", async () => {
      // Arrange
      const consumerHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "consumer",
        metadata: {},
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [consumerHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      expect(registry.getAllHandlers()).toHaveLength(0);
    });
  });

  describe("scanModule — function handlers with schema", () => {
    it("auto-injects validation layer when schema.body is provided", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data as { name: string } };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/validated",
          method: "POST",
          schema: { body: bodySchema },
          layers: [],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/validated", "POST");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("prepends validation layer before user-provided layers", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data };
      const userLayer: CelerityLayer = {
        handle: async (_ctx, next) => next(),
      };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/validated",
          method: "POST",
          schema: { body: bodySchema },
          layers: [userLayer],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/validated", "POST");
      expect(handler!.layers).toHaveLength(2);
      expect(handler!.layers[1]).toBe(userLayer);
    });

    it("does not inject validation layer when no schema is provided", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/plain", method: "GET", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/plain", "GET");
      expect(handler!.layers).toHaveLength(0);
    });

    it("auto-injects a single validation layer when multiple schemas are provided", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data };
      const querySchema = { parse: (data: unknown) => data };
      const paramsSchema = { parse: (data: unknown) => data };
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/multi/{id}",
          method: "POST",
          schema: { body: bodySchema, query: querySchema, params: paramsSchema },
          layers: [],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/multi/1", "POST");
      expect(handler!.layers).toHaveLength(1);
    });

    it("does not inject validation layer when schema object has no fields", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/empty", method: "GET", schema: {}, layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/empty", "GET");
      expect(handler!.layers).toHaveLength(0);
    });
  });

  describe("getHandler — route matching", () => {
    beforeEach(async () => {
      @Module({ controllers: [UserHandler, ItemHandler] })
      class M {}
      await registry.scanModule(M, container);
    });

    it("matches an exact static route", () => {
      // Act
      const handler = registry.getHandler("/users", "GET");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.path).toBe("/users");
      expect(handler!.method).toBe("GET");
    });

    it("matches a parameterized route", () => {
      // Act
      const handler = registry.getHandler("/users/42", "GET");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.path).toBe("/users/{id}");
    });

    it("returns undefined for an unmatched path", () => {
      // Act
      const handler = registry.getHandler("/nonexistent", "GET");

      // Assert
      expect(handler).toBeUndefined();
    });

    it("returns undefined when path matches but method does not", () => {
      // Act
      const handler = registry.getHandler("/users", "DELETE");

      // Assert
      expect(handler).toBeUndefined();
    });

    it("distinguishes between methods on the same path", () => {
      // Act
      const getHandler = registry.getHandler("/users", "GET");
      const postHandler = registry.getHandler("/users", "POST");

      // Assert
      expect(getHandler).toBeDefined();
      expect(postHandler).toBeDefined();
      expect(getHandler).not.toBe(postHandler);
      expect(getHandler!.method).toBe("GET");
      expect(postHandler!.method).toBe("POST");
    });

    it("matches delete route with path param", () => {
      // Act
      const handler = registry.getHandler("/items/99", "DELETE");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.path).toBe("/items/{id}");
      expect(handler!.method).toBe("DELETE");
    });

    it("does not match when segment count differs", () => {
      // Act
      const handler = registry.getHandler("/users/42/extra", "GET");

      // Assert
      expect(handler).toBeUndefined();
    });
  });

  describe("getHandler — {param} format matching", () => {
    it("matches a route using {param} format", async () => {
      // Arrange — register a function handler with {param} path
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/orders/{orderId}", method: "GET" },
        handler: () => ({ id: 1 }),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}
      await registry.scanModule(M, container);

      // Act
      const handler = registry.getHandler("/orders/abc-123", "GET");

      // Assert
      expect(handler).toBeDefined();
      expect(handler!.path).toBe("/orders/{orderId}");
    });

    it("does not match {param} when segment count differs", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/orders/{orderId}", method: "GET" },
        handler: () => ({ id: 1 }),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}
      await registry.scanModule(M, container);

      // Act
      const handler = registry.getHandler("/orders/abc/extra", "GET");

      // Assert
      expect(handler).toBeUndefined();
    });
  });

  describe("path normalization", () => {
    it("handles prefix and route without leading slash", async () => {
      // Arrange
      @Controller("api")
      class ApiHandler {
        @Get("health")
        health() {
          return { ok: true };
        }
      }

      @Module({ controllers: [ApiHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/api/health", "GET");
      expect(handler).toBeDefined();
    });

    it("handles empty prefix", async () => {
      // Arrange
      @Controller()
      class RootHandler {
        @Get("/ping")
        ping() {
          return "pong";
        }
      }

      @Module({ controllers: [RootHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/ping", "GET");
      expect(handler).toBeDefined();
    });

    it("collapses double slashes in paths", async () => {
      // Arrange
      @Controller("/v1/")
      class V1Handler {
        @Get("/status")
        status() {
          return { ok: true };
        }
      }

      @Module({ controllers: [V1Handler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/v1/status", "GET");
      expect(handler).toBeDefined();
    });
  });

  describe("customMetadata", () => {
    it("collects method-level @SetMetadata into customMetadata", async () => {
      // Arrange
      @Controller("/meta")
      class MetaHandler {
        @Get("/")
        @Action("items:read")
        list() {
          return [];
        }
      }

      @Module({ controllers: [MetaHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/meta", "GET");
      expect(handler).toBeDefined();
      expect(handler!.customMetadata).toEqual({ action: "items:read" });
    });

    it("merges class-level and method-level custom metadata", async () => {
      // Arrange
      @Controller("/meta")
      @SetMetadata("resource", "posts")
      class MetaHandler {
        @Get("/")
        @Action("posts:read")
        list() {
          return [];
        }
      }

      @Module({ controllers: [MetaHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/meta", "GET");
      expect(handler!.customMetadata).toEqual({ resource: "posts", action: "posts:read" });
    });

    it("method-level overrides class-level for the same key", async () => {
      // Arrange
      @Controller("/meta")
      @SetMetadata("action", "default")
      class MetaHandler {
        @Get("/")
        @SetMetadata("action", "specific")
        list() {
          return [];
        }
      }

      @Module({ controllers: [MetaHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/meta", "GET");
      expect(handler!.customMetadata.action).toBe("specific");
    });

    it("defaults to empty object when no custom metadata is set", async () => {
      // Arrange
      @Module({ controllers: [UserHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/users", "GET");
      expect(handler!.customMetadata).toEqual({});
    });

    it("reads customMetadata from function handler definitions", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/fn/action",
          method: "GET",
          layers: [],
          customMetadata: { action: "fn:read", rateLimit: 50 },
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/fn/action", "GET");
      expect(handler!.customMetadata).toEqual({ action: "fn:read", rateLimit: 50 });
    });

    it("defaults function handler customMetadata to empty object", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/fn/plain", method: "GET", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/fn/plain", "GET");
      expect(handler!.customMetadata).toEqual({});
    });
  });

  describe("scanModule — function handler inject tokens", () => {
    it("stores inject tokens from function handler metadata", async () => {
      // Arrange
      const DB_TOKEN = Symbol("DB_TOKEN");
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/injected",
          method: "GET",
          layers: [],
          inject: [DB_TOKEN],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/injected", "GET");
      expect(handler).toBeDefined();
      expect(handler!.injectTokens).toEqual([DB_TOKEN]);
    });

    it("defaults inject tokens to empty array when not specified", async () => {
      // Arrange
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: { path: "/no-inject", method: "GET", layers: [] },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/no-inject", "GET");
      expect(handler!.injectTokens).toEqual([]);
    });

    it("stores multiple inject tokens in declaration order", async () => {
      // Arrange
      const TOKEN_A = Symbol("A");
      const TOKEN_B = Symbol("B");
      const TOKEN_C = Symbol("C");
      const fnHandler: FunctionHandlerDefinition = {
        __celerity_handler: true,
        type: "http",
        metadata: {
          path: "/multi-inject",
          method: "GET",
          layers: [],
          inject: [TOKEN_A, TOKEN_B, TOKEN_C],
        },
        handler: vi.fn(),
      };

      @Module({ functionHandlers: [fnHandler] })
      class FnModule {}

      // Act
      await registry.scanModule(FnModule, container);

      // Assert
      const handler = registry.getHandler("/multi-inject", "GET");
      expect(handler!.injectTokens).toEqual([TOKEN_A, TOKEN_B, TOKEN_C]);
    });
  });

  describe("scanModule — class handler schema auto-injection", () => {
    it("auto-injects validation layer when @Body(schema) is used", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data as { name: string } };

      @Controller("/validated")
      class ValidatedHandler {
        @Post("/")
        create(@Body(bodySchema) _body: { name: string }) {
          return { ok: true };
        }
      }

      @Module({ controllers: [ValidatedHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/validated", "POST");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("auto-injects validation layer when @Query(schema) is used (whole-object)", async () => {
      // Arrange
      const querySchema = { parse: (data: unknown) => data as { page: string } };

      @Controller("/search")
      class SearchHandler {
        @Get("/")
        search(@Query(querySchema) _query: { page: string }) {
          return [];
        }
      }

      @Module({ controllers: [SearchHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/search", "GET");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("auto-injects validation layer for per-key @Query('key', schema)", async () => {
      // Arrange
      const pageSchema = { parse: (data: unknown) => Number(data) };

      @Controller("/items")
      class PaginatedHandler {
        @Get("/")
        list(@Query("page", pageSchema) _page: number) {
          return [];
        }
      }

      @Module({ controllers: [PaginatedHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/items", "GET");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("auto-injects validation layer for @Param(schema)", async () => {
      // Arrange
      const paramsSchema = { parse: (data: unknown) => data as { id: string } };

      @Controller("/resources")
      class ResourceHandler {
        @Get("/{id}")
        findOne(@Param(paramsSchema) _params: { id: string }) {
          return {};
        }
      }

      @Module({ controllers: [ResourceHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/resources/1", "GET");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("auto-injects validation layer for @Headers(schema)", async () => {
      // Arrange
      const headersSchema = { parse: (data: unknown) => data as { authorization: string } };

      @Controller("/secure")
      class SecureHandler {
        @Get("/")
        check(@Headers(headersSchema) _headers: { authorization: string }) {
          return { ok: true };
        }
      }

      @Module({ controllers: [SecureHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/secure", "GET");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("injects a single validation layer when multiple param schemas exist", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data };
      const querySchema = { parse: (data: unknown) => data };

      @Controller("/multi")
      class MultiHandler {
        @Post("/")
        create(
          @Body(bodySchema) _body: unknown,
          @Query(querySchema) _query: unknown,
        ) {
          return { ok: true };
        }
      }

      @Module({ controllers: [MultiHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/multi", "POST");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(1);
    });

    it("does not inject validation layer when no param schemas are present", async () => {
      // Arrange — UserHandler has @Body(), @Param("id"), @Query("page") without schemas
      @Module({ controllers: [UserHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/users", "GET");
      expect(handler).toBeDefined();
      expect(handler!.layers).toHaveLength(0);
    });

    it("prepends validation layer before user-provided layers", async () => {
      // Arrange
      const bodySchema = { parse: (data: unknown) => data };

      class CustomLayer implements CelerityLayer {
        async handle(
          _ctx: HandlerContext,
          next: () => Promise<HandlerResponse>,
        ): Promise<HandlerResponse> {
          return next();
        }
      }

      @Controller("/layered")
      class LayeredHandler {
        @Post("/")
        @UseLayer(CustomLayer)
        create(@Body(bodySchema) _body: unknown) {
          return { ok: true };
        }
      }

      @Module({ controllers: [LayeredHandler] })
      class M {}

      // Act
      await registry.scanModule(M, container);

      // Assert
      const handler = registry.getHandler("/layered", "POST");
      expect(handler).toBeDefined();
      // validation layer prepended + CustomLayer from @UseLayer
      expect(handler!.layers).toHaveLength(2);
    });
  });
});
