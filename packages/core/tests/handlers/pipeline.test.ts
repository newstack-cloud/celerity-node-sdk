import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import {
  executeHandlerPipeline,
  type ResolvedHandler,
  type PipelineOptions,
} from "../../src/handlers/pipeline";
import {
  HttpException,
  BadRequestException,
} from "../../src/errors/http-exception";
import type {
  HttpRequest,
  HttpResponse,
  CelerityLayer,
} from "@celerity-sdk/types";

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    path: "/test",
    pathParams: {},
    query: {},
    headers: {},
    cookies: {},
    textBody: null,
    binaryBody: null,
    contentType: null,
    requestId: "req-1",
    requestTime: new Date().toISOString(),
    auth: null,
    clientIp: null,
    traceContext: null,
    userAgent: null,
    matchedRoute: null,
    ...overrides,
  };
}

function makeHandler(overrides: Partial<ResolvedHandler> = {}): ResolvedHandler {
  return {
    path: "/test",
    method: "GET",
    protectedBy: [],
    layers: [],
    isPublic: false,
    paramMetadata: [],
    customMetadata: {},
    handlerFn: vi.fn().mockReturnValue({ message: "ok" }),
    handlerInstance: {},
    ...overrides,
  };
}

const defaultOptions: PipelineOptions = {
  container: {
    resolve: vi.fn(),
    register: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    closeAll: vi.fn(),
  },
};

describe("executeHandlerPipeline", () => {
  describe("response normalization", () => {
    it("wraps a plain object return value into a 200 JSON response", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn().mockReturnValue({ greeting: "hello" }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(200);
      expect(result.headers).toEqual({ "content-type": "application/json" });
      expect(result.body).toBe(JSON.stringify({ greeting: "hello" }));
    });

    it("wraps a string return value into a 200 JSON response with body as-is", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn().mockReturnValue("plain text"),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(200);
      expect(result.body).toBe("plain text");
    });

    it("returns a 204 response when the handler returns null", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn().mockReturnValue(null),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(204);
    });

    it("returns a 204 response when the handler returns undefined", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn().mockReturnValue(undefined),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(204);
    });

    it("passes through an HttpResponse object unchanged", async () => {
      // Arrange
      const customResponse: HttpResponse = {
        status: 201,
        headers: { "x-custom": "value" },
        body: "created",
      };
      const handler = makeHandler({
        handlerFn: vi.fn().mockReturnValue(customResponse),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result).toEqual(customResponse);
    });
  });

  describe("layer integration", () => {
    it("wraps handler execution inside layers", async () => {
      // Arrange
      const callOrder: string[] = [];
      const layer: CelerityLayer = {
        handle: async (_ctx, next) => {
          callOrder.push("layer:before");
          const res = await next();
          callOrder.push("layer:after");
          return res;
        },
      };
      const handler = makeHandler({
        layers: [layer],
        handlerFn: vi.fn(() => {
          callOrder.push("handler");
          return { ok: true };
        }),
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(callOrder).toEqual(["layer:before", "handler", "layer:after"]);
    });

    it("layer can short-circuit the pipeline and return custom response", async () => {
      // Arrange
      const layer: CelerityLayer = {
        handle: async () => ({
          status: 429,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Too many requests" }),
        }),
      };
      const handler = makeHandler({
        layers: [layer],
        handlerFn: vi.fn().mockReturnValue({ ok: true }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(429);
      expect(handler.handlerFn).not.toHaveBeenCalled();
    });
  });

  describe("HttpException handling", () => {
    it("catches HttpException and returns a structured error response", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new BadRequestException("Invalid input", { field: "name" });
        }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(400);
      expect(result.headers).toEqual({ "content-type": "application/json" });
      const body = JSON.parse(result.body!);
      expect(body.message).toBe("Invalid input");
      expect(body.details).toEqual({ field: "name" });
    });

    it("catches generic HttpException with custom status code", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new HttpException(422, "Unprocessable Entity");
        }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(422);
      const body = JSON.parse(result.body!);
      expect(body.message).toBe("Unprocessable Entity");
    });

    it("omits details from body when not provided", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new HttpException(400, "Bad request");
        }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const body = JSON.parse(result.body!);
      expect(body).not.toHaveProperty("details");
    });

    it("returns 500 for non-HttpException errors", async () => {
      // Arrange
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new Error("unexpected error");
        }),
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(result.status).toBe(500);
      const body = JSON.parse(result.body!);
      expect(body.message).toBe("Internal Server Error");
    });

    it("logs non-HttpException errors via context logger when available", async () => {
      // Arrange
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
        withContext: vi.fn(),
      };
      const systemLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.logger = mockLogger;
          return next();
        },
      };
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new Error("boom");
        }),
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, {
        ...defaultOptions,
        systemLayers: [systemLayer],
      });

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Unhandled error in handler pipeline",
        expect.objectContaining({ error: "boom", stack: expect.any(String) }),
      );
    });

    it("falls back to console.error when no logger is available", async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = makeHandler({
        handlerFn: vi.fn(() => {
          throw new Error("no logger error");
        }),
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        "Unhandled error in handler pipeline:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("param extraction for class handlers", () => {
    it("extracts body param and passes it to the handler function", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ created: true });
      const instance = {};
      const handler = makeHandler({
        handlerFn,
        handlerInstance: instance,
        paramMetadata: [{ index: 0, type: "body" }],
      });
      const request = makeRequest({
        textBody: JSON.stringify({ name: "test" }),
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith({ name: "test" });
    });

    it("extracts query param by key", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "query", key: "page" }],
      });
      const request = makeRequest({ query: { page: "2", limit: "10" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith("2");
    });

    it("extracts path param by key", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "param", key: "id" }],
      });
      const request = makeRequest({ pathParams: { id: "abc-123" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith("abc-123");
    });

    it("extracts multiple params in correct order", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [
          { index: 0, type: "param", key: "id" },
          { index: 1, type: "body" },
          { index: 2, type: "query", key: "verbose" },
        ],
      });
      const request = makeRequest({
        pathParams: { id: "42" },
        textBody: JSON.stringify({ data: "payload" }),
        query: { verbose: "true" },
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith("42", { data: "payload" }, "true");
    });

    it("extracts the full request when param type is 'request'", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const request = makeRequest({ path: "/items" });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        paramMetadata: [{ index: 0, type: "request" }],
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith(request);
    });
  });

  describe("class handler validated param extraction", () => {
    it("reads validatedBody from metadata when set by a layer", async () => {
      // Arrange
      const validated = { name: "validated" };
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedBody", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        layers: [layer],
        paramMetadata: [{ index: 0, type: "body" }],
      });
      const request = makeRequest({ textBody: JSON.stringify({ name: "raw" }) });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith({ name: "validated" });
    });

    it("reads specific key from validatedQuery when set by a layer", async () => {
      // Arrange
      const validated = { page: 5, limit: 10 };
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedQuery", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        layers: [layer],
        paramMetadata: [{ index: 0, type: "query", key: "page" }],
      });
      const request = makeRequest({ query: { page: "5", limit: "10" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith(5);
    });

    it("reads whole validatedQuery when no key is specified", async () => {
      // Arrange
      const validated = { page: 1, limit: 20 };
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedQuery", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        layers: [layer],
        paramMetadata: [{ index: 0, type: "query" }],
      });
      const request = makeRequest({ query: { page: "1", limit: "20" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it("reads specific key from validatedParams when set by a layer", async () => {
      // Arrange
      const validated = { id: 42 };
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedParams", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        layers: [layer],
        paramMetadata: [{ index: 0, type: "param", key: "id" }],
      });
      const request = makeRequest({ pathParams: { id: "42" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith(42);
    });

    it("reads specific key from validatedHeaders when set by a layer", async () => {
      // Arrange
      const validated = { "x-custom": "lowered" };
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedHeaders", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        handlerInstance: {},
        layers: [layer],
        paramMetadata: [{ index: 0, type: "headers", key: "x-custom" }],
      });
      const request = makeRequest({ headers: { "x-custom": "VALUE" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledWith("lowered");
    });

});

  describe("function handler invocation", () => {
    it("invokes function handlers with HttpHandlerRequest and HttpHandlerContext", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const request = makeRequest({
        pathParams: { id: "1" },
        query: { q: "test" },
        headers: { authorization: "Bearer token" },
        cookies: { session: "abc" },
        auth: { sub: "user-1" },
        requestId: "req-42",
        clientIp: "127.0.0.1",
      });

      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(handlerFn).toHaveBeenCalledOnce();
      const req = handlerFn.mock.calls[0][0];
      const ctx = handlerFn.mock.calls[0][1];

      // Request fields
      expect(req.params).toEqual({ id: "1" });
      expect(req.query).toEqual({ q: "test" });
      expect(req.headers).toEqual({ authorization: "Bearer token" });
      expect(req.cookies).toEqual({ session: "abc" });
      expect(req.auth).toEqual({ sub: "user-1" });
      expect(req.clientIp).toBe("127.0.0.1");
      expect(req.method).toBe("GET");
      expect(req.path).toBe("/test");

      // Context fields
      expect(ctx.requestId).toBe("req-42");
      expect(ctx.requestTime).toBeDefined();
      expect(ctx.metadata).toBeDefined();
      expect(ctx.raw).toBe(request);
    });

    it("parses textBody as JSON for the function handler request", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const request = makeRequest({
        textBody: JSON.stringify({ hello: "world" }),
      });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.body).toEqual({ hello: "world" });
    });

    it("uses validatedBody from metadata when set by a layer", async () => {
      // Arrange
      const validated = { hello: "validated" };
      const validationLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedBody", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validationLayer],
        paramMetadata: [],
      });
      const request = makeRequest({
        textBody: JSON.stringify({ hello: "raw" }),
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.body).toEqual({ hello: "validated" });
    });

    it("uses binaryBody when no textBody or validatedBody is present", async () => {
      // Arrange
      const binaryData = Buffer.from("binary content");
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
      });
      const request = makeRequest({
        binaryBody: binaryData,
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.body).toBe(binaryData);
    });

    it("uses validatedQuery from metadata when set by a layer", async () => {
      // Arrange
      const validated = { page: 1 };
      const validationLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedQuery", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validationLayer],
        paramMetadata: [],
      });
      const request = makeRequest({ query: { page: "1", extra: "ignored" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.query).toEqual({ page: 1 });
    });

    it("uses validatedParams from metadata when set by a layer", async () => {
      // Arrange
      const validated = { id: 42 };
      const validationLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedParams", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validationLayer],
        paramMetadata: [],
      });
      const request = makeRequest({ pathParams: { id: "42" } });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.params).toEqual({ id: 42 });
    });

    it("uses validatedHeaders from metadata when set by a layer", async () => {
      // Arrange
      const validated = { authorization: "Bearer token" };
      const validationLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("validatedHeaders", validated);
          return next();
        },
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        layers: [validationLayer],
        paramMetadata: [],
      });
      const request = makeRequest({
        headers: { authorization: "Bearer token", "x-extra": "value" },
      });

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const req = handlerFn.mock.calls[0][0];
      expect(req.headers).toEqual({ authorization: "Bearer token" });
    });

    it("exposes metadata on HttpHandlerContext", async () => {
      // Arrange
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        customMetadata: { action: "test:read" },
        paramMetadata: [],
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      const ctx = handlerFn.mock.calls[0][1];
      expect(ctx.metadata.get("action")).toBe("test:read");
    });
  });

  describe("function handler dependency injection", () => {
    it("resolves inject tokens and passes them as additional args", async () => {
      // Arrange
      const DB_TOKEN = Symbol("DB_TOKEN");
      const dbInstance = { query: vi.fn() };
      const container = {
        resolve: vi.fn().mockResolvedValue(dbInstance),
        register: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        closeAll: vi.fn(),
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
        injectTokens: [DB_TOKEN],
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, { container });

      // Assert
      expect(container.resolve).toHaveBeenCalledWith(DB_TOKEN);
      expect(handlerFn).toHaveBeenCalledOnce();
      const args = handlerFn.mock.calls[0];
      expect(args[2]).toBe(dbInstance);
    });

    it("resolves multiple inject tokens in declaration order", async () => {
      // Arrange
      const TOKEN_A = Symbol("A");
      const TOKEN_B = Symbol("B");
      const TOKEN_C = Symbol("C");
      const instanceA = { name: "a" };
      const instanceB = { name: "b" };
      const instanceC = { name: "c" };
      const container = {
        resolve: vi.fn().mockImplementation(async (token: unknown) => {
          if (token === TOKEN_A) return instanceA;
          if (token === TOKEN_B) return instanceB;
          if (token === TOKEN_C) return instanceC;
          throw new Error("Unknown token");
        }),
        register: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        closeAll: vi.fn(),
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
        injectTokens: [TOKEN_A, TOKEN_B, TOKEN_C],
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, { container });

      // Assert
      const args = handlerFn.mock.calls[0];
      expect(args[2]).toBe(instanceA);
      expect(args[3]).toBe(instanceB);
      expect(args[4]).toBe(instanceC);
    });

    it("returns 500 when inject token cannot be resolved", async () => {
      // Arrange
      const MISSING = Symbol("MISSING");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const container = {
        resolve: vi.fn().mockRejectedValue(new Error("No provider registered for Symbol(MISSING)")),
        register: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        closeAll: vi.fn(),
      };
      const handler = makeHandler({
        handlerFn: vi.fn(),
        isFunctionHandler: true,
        paramMetadata: [],
        injectTokens: [MISSING],
      });
      const request = makeRequest();

      // Act
      const result = await executeHandlerPipeline(handler, request, { container });

      // Assert
      expect(result.status).toBe(500);
      const body = JSON.parse(result.body!);
      expect(body.message).toBe("Internal Server Error");
      consoleSpy.mockRestore();
    });

    it("does not call resolve when no inject tokens are present", async () => {
      // Arrange
      const container = {
        resolve: vi.fn(),
        register: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        closeAll: vi.fn(),
      };
      const handlerFn = vi.fn().mockReturnValue({ ok: true });
      const handler = makeHandler({
        handlerFn,
        isFunctionHandler: true,
        paramMetadata: [],
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, { container });

      // Assert
      expect(container.resolve).not.toHaveBeenCalled();
      expect(handlerFn).toHaveBeenCalledOnce();
      // Only req and ctx args
      expect(handlerFn.mock.calls[0]).toHaveLength(2);
    });

  });

  describe("context.metadata injection", () => {
    it("populates context.metadata from handler customMetadata", async () => {
      // Arrange
      let capturedAction: unknown;
      let capturedRateLimit: unknown;
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          capturedAction = ctx.metadata.get("action");
          capturedRateLimit = ctx.metadata.get("rateLimit");
          return next();
        },
      };
      const handler = makeHandler({
        layers: [layer],
        customMetadata: { action: "posts:read", rateLimit: 100 },
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(capturedAction).toBe("posts:read");
      expect(capturedRateLimit).toBe(100);
    });

    it("provides empty metadata when handler has no customMetadata", async () => {
      // Arrange
      let hasAction = true;
      const layer: CelerityLayer = {
        handle: async (ctx, next) => {
          hasAction = ctx.metadata.has("action");
          return next();
        },
      };
      const handler = makeHandler({ layers: [layer] });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(hasAction).toBe(false);
    });

    it("supports request-scoped metadata via set/get", async () => {
      // Arrange
      let downstreamValue: unknown;
      const settingLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          ctx.metadata.set("requestScoped", "layer-value");
          return next();
        },
      };
      const readingLayer: CelerityLayer = {
        handle: async (ctx, next) => {
          downstreamValue = ctx.metadata.get("requestScoped");
          return next();
        },
      };
      const handler = makeHandler({
        layers: [settingLayer, readingLayer],
        customMetadata: { action: "test" },
      });
      const request = makeRequest();

      // Act
      await executeHandlerPipeline(handler, request, defaultOptions);

      // Assert
      expect(downstreamValue).toBe("layer-value");
    });
  });
});
