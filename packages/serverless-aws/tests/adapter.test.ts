import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ResolvedHandler, PipelineOptions } from "@celerity-sdk/core";
import { AwsLambdaAdapter } from "../src/adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal mock of HandlerRegistry that satisfies the interface used by
 * AwsLambdaAdapter. The adapter only calls `getHandler(path, method)`.
 */
function createMockRegistry(handlers: ResolvedHandler[] = []) {
  return {
    getHandler: vi.fn((path: string, method: string) => {
      return handlers.find((h) => h.path != null && matchRoute(h.path, path) && h.method === method);
    }),
    getAllHandlers: vi.fn(() => [...handlers]),
    scanModule: vi.fn(async () => {}),
  };
}

/** Simple route matcher mirroring the one in HandlerRegistry. */
function matchRoute(pattern: string, actual: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);
  if (patternParts.length !== actualParts.length) return false;
  return patternParts.every(
    (part, i) => part.startsWith(":") || part === actualParts[i],
  );
}

/** Creates a minimal ResolvedHandler that returns a simple 200 JSON response. */
function createResolvedHandler(
  path: string,
  method: string,
  responseBody: unknown = { ok: true },
): ResolvedHandler {
  return {
    path,
    method,
    protectedBy: [],
    layers: [],
    isPublic: true,
    paramMetadata: [],
    customMetadata: {},
    handlerFn: vi.fn(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(responseBody),
    })),
    isFunctionHandler: true,
  };
}

/** Creates a realistic API Gateway v2 event for use in adapter tests. */
function createApiGatewayEvent(
  method: string,
  path: string,
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
    },
    requestContext: {
      accountId: "123456789012",
      apiId: "test-api",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "TestRunner/1.0",
      },
      requestId: "test-req-id",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "2026-02-08T10:00:00Z",
      timeEpoch: 1770508800000,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

// ===========================================================================
// AwsLambdaAdapter
// ===========================================================================

const mockOptions: PipelineOptions = {
  container: {
    resolve: vi.fn() as unknown as import("@celerity-sdk/types").ServiceContainer["resolve"],
    register: vi.fn() as unknown as import("@celerity-sdk/types").ServiceContainer["register"],
    has: vi.fn().mockReturnValue(false),
    closeAll: vi.fn().mockResolvedValue(undefined),
  },
};

describe("AwsLambdaAdapter", () => {
  let adapter: AwsLambdaAdapter;

  beforeEach(() => {
    adapter = new AwsLambdaAdapter();
  });

  // ---------------------------------------------------------------
  // createHandler returns a function
  // ---------------------------------------------------------------
  describe("createHandler", () => {
    it("returns a function", () => {
      // Arrange
      const registry = createMockRegistry();

      // Act
      const handler = adapter.createHandler(registry as never, mockOptions);

      // Assert
      expect(typeof handler).toBe("function");
    });

    it("returns an async function that accepts event and context", () => {
      // Arrange
      const registry = createMockRegistry();

      // Act
      const handler = adapter.createHandler(registry as never, mockOptions);

      // Assert
      // async functions have a constructor named AsyncFunction
      expect(handler.constructor.name).toBe("AsyncFunction");
    });
  });

  // ---------------------------------------------------------------
  // 404 for unmatched routes
  // ---------------------------------------------------------------
  describe("unmatched routes", () => {
    it("returns 404 with a JSON body when no handler matches the route", async () => {
      // Arrange
      const registry = createMockRegistry();
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/nonexistent");

      // Act
      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      // Assert
      expect(result).toEqual({
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "No handler for GET /nonexistent",
        }),
      });
    });

    it("returns 404 when the path matches but the method does not", async () => {
      // Arrange
      const getHandler = createResolvedHandler("/items", "GET");
      const registry = createMockRegistry([getHandler]);
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("POST", "/items");

      // Act
      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.message).toBe("No handler for POST /items");
    });

    it("includes the method and path in the 404 error message", async () => {
      // Arrange
      const registry = createMockRegistry();
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("DELETE", "/resources/42");

      // Act
      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      // Assert
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain("DELETE");
      expect(body.message).toContain("/resources/42");
    });
  });

  // ---------------------------------------------------------------
  // Successful handler execution
  // ---------------------------------------------------------------
  describe("handler execution", () => {
    it("invokes the matched handler and returns the mapped response", async () => {
      // Arrange
      const usersHandler = createResolvedHandler("/users", "GET", {
        users: ["Alice", "Bob"],
      });
      const registry = createMockRegistry([usersHandler]);
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/users");

      // Act
      const result = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual({ "content-type": "application/json" });
      expect(JSON.parse(result.body as string)).toEqual({
        users: ["Alice", "Bob"],
      });
    });

    it("calls registry.getHandler with the correct path and method", async () => {
      // Arrange
      const registry = createMockRegistry();
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("POST", "/orders");

      // Act
      await handler(event, {});

      // Assert
      expect(registry.getHandler).toHaveBeenCalledWith("/orders", "POST");
    });
  });

  // ---------------------------------------------------------------
  // Cold start handler caching
  // ---------------------------------------------------------------
  describe("cold start handler caching", () => {
    it("resolves the handler on the first invocation and caches it for subsequent calls", async () => {
      // Arrange
      const usersHandler = createResolvedHandler("/users", "GET");
      const registry = createMockRegistry([usersHandler]);
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/users");

      // Act — invoke twice
      await handler(event, {});
      await handler(event, {});

      // Assert — getHandler should be called only once due to caching
      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("uses the cached handler for all subsequent invocations", async () => {
      // Arrange
      const responseBody = { cached: true };
      const cachedHandler = createResolvedHandler("/data", "GET", responseBody);
      const registry = createMockRegistry([cachedHandler]);
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/data");

      // Act — invoke three times
      const result1 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;
      const result2 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;
      const result3 = (await handler(event, {})) as APIGatewayProxyStructuredResultV2;

      // Assert — all return the same result and registry.getHandler called once
      expect(JSON.parse(result1.body as string)).toEqual(responseBody);
      expect(JSON.parse(result2.body as string)).toEqual(responseBody);
      expect(JSON.parse(result3.body as string)).toEqual(responseBody);
      expect(registry.getHandler).toHaveBeenCalledTimes(1);
    });

    it("does not cache a null handler — retries lookup on each call when no match", async () => {
      // Arrange
      const registry = createMockRegistry();
      const handler = adapter.createHandler(registry as never, mockOptions);
      const event = createApiGatewayEvent("GET", "/missing");

      // Act — invoke twice with no registered handlers
      await handler(event, {});
      await handler(event, {});

      // Assert — getHandler should be called each time since null was never cached
      expect(registry.getHandler).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------
  // Each createHandler call gets its own isolated cache
  // ---------------------------------------------------------------
  describe("handler isolation", () => {
    it("each createHandler call produces an independent handler with its own cache", async () => {
      // Arrange
      const handlerA = createResolvedHandler("/a", "GET", { route: "a" });
      const handlerB = createResolvedHandler("/b", "GET", { route: "b" });
      const registryA = createMockRegistry([handlerA]);
      const registryB = createMockRegistry([handlerB]);

      const fnA = adapter.createHandler(registryA as never, mockOptions);
      const fnB = adapter.createHandler(registryB as never, mockOptions);

      // Act
      const resultA = (await fnA(
        createApiGatewayEvent("GET", "/a"),
        {},
      )) as APIGatewayProxyStructuredResultV2;
      const resultB = (await fnB(
        createApiGatewayEvent("GET", "/b"),
        {},
      )) as APIGatewayProxyStructuredResultV2;

      // Assert
      expect(JSON.parse(resultA.body as string)).toEqual({ route: "a" });
      expect(JSON.parse(resultB.body as string)).toEqual({ route: "b" });
      expect(registryA.getHandler).toHaveBeenCalledTimes(1);
      expect(registryB.getHandler).toHaveBeenCalledTimes(1);
    });
  });
});
