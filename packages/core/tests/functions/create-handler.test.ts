import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import {
  createHttpHandler,
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
} from "../../src/functions/create-handler";
import type {
  CelerityLayer,
  HandlerContext,
  HandlerResponse,
  FunctionHandlerDefinition,
} from "@celerity-sdk/types";
import type { HttpHandlerRequest, HttpHandlerContext } from "../../src/functions/context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidDefinition(
  definition: FunctionHandlerDefinition,
  expectedMethod: string,
  expectedPath: string,
): void {
  expect(definition.__celerity_handler).toBe(true);
  expect(definition.type).toBe("http");

  const meta = definition.metadata as Record<string, unknown>;
  expect(meta.method).toBe(expectedMethod);
  expect(meta.path).toBe(expectedPath);
  expect(typeof definition.handler).toBe("function");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createHttpHandler", () => {
  it("returns a FunctionHandlerDefinition with the correct structure", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = createHttpHandler(
      { path: "/items", method: "GET" },
      handler,
    );

    // Assert
    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("http");
    expect(result.handler).toBe(handler);
  });

  it("sets path and method from config", () => {
    // Arrange & Act
    const result = createHttpHandler(
      { path: "/users/{id}", method: "PUT" },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.path).toBe("/users/{id}");
    expect(meta.method).toBe("PUT");
  });

  it("defaults layers to an empty array when not provided", () => {
    // Arrange & Act
    const result = createHttpHandler(
      { path: "/test", method: "GET" },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([]);
  });

  it("defaults inject to an empty array when not provided", () => {
    // Arrange & Act
    const result = createHttpHandler(
      { path: "/test", method: "GET" },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([]);
  });

  it("includes layers when provided in config", () => {
    // Arrange
    class TestLayer implements CelerityLayer {
      async handle(
        _ctx: HandlerContext,
        next: () => Promise<HandlerResponse>,
      ): Promise<HandlerResponse> {
        return next();
      }
    }

    // Act
    const result = createHttpHandler(
      { path: "/test", method: "GET", layers: [TestLayer] },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([TestLayer]);
  });

  it("includes inject tokens when provided in config", () => {
    // Arrange
    const DB_TOKEN = Symbol("DB");

    // Act
    const result = createHttpHandler(
      { path: "/test", method: "GET", inject: [DB_TOKEN, "LOGGER"] },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.inject).toEqual([DB_TOKEN, "LOGGER"]);
  });

  it("preserves the handler function reference", () => {
    // Arrange
    const myHandler = (req: HttpHandlerRequest, _ctx: HttpHandlerContext) => ({ hello: req.params.name });

    // Act
    const result = createHttpHandler(
      { path: "/greet/{name}", method: "GET" },
      myHandler,
    );

    // Assert
    expect(result.handler).toBe(myHandler);
  });
});

describe("httpGet", () => {
  it("creates a GET handler definition", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = httpGet("/users", handler);

    // Assert
    assertValidDefinition(result, "GET", "/users");
  });

});

describe("httpPost", () => {
  it("creates a POST handler definition", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = httpPost("/users", handler);

    // Assert
    assertValidDefinition(result, "POST", "/users");
  });
});

describe("httpPut", () => {
  it("creates a PUT handler definition", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = httpPut("/users/{id}", handler);

    // Assert
    assertValidDefinition(result, "PUT", "/users/{id}");
  });
});

describe("httpPatch", () => {
  it("creates a PATCH handler definition", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = httpPatch("/users/{id}", handler);

    // Assert
    assertValidDefinition(result, "PATCH", "/users/{id}");
  });
});

describe("httpDelete", () => {
  it("creates a DELETE handler definition", () => {
    // Arrange
    const handler = vi.fn();

    // Act
    const result = httpDelete("/users/{id}", handler);

    // Assert
    assertValidDefinition(result, "DELETE", "/users/{id}");
  });
});

describe("blueprint-first (no path/method)", () => {
  it("omits path and method from metadata when not provided", () => {
    const result = createHttpHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("path");
    expect(meta).not.toHaveProperty("method");
  });

  it("returns a valid FunctionHandlerDefinition with empty config", () => {
    const handler = vi.fn();
    const result = createHttpHandler({}, handler);

    expect(result.__celerity_handler).toBe(true);
    expect(result.type).toBe("http");
    expect(result.handler).toBe(handler);
  });

  it("includes schema and layers without path/method", () => {
    const bodySchema = { parse: (data: unknown) => data as { name: string } };
    const DB_TOKEN = Symbol("DB");

    const result = createHttpHandler(
      { schema: { body: bodySchema }, inject: [DB_TOKEN] },
      vi.fn(),
    );

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("path");
    expect(meta).not.toHaveProperty("method");
    expect(meta.schema).toEqual({ body: bodySchema });
    expect(meta.inject).toEqual([DB_TOKEN]);
  });

  it("defaults layers and inject to empty arrays with empty config", () => {
    const result = createHttpHandler({}, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([]);
    expect(meta.inject).toEqual([]);
  });

  it("includes path when provided but omits method when not", () => {
    const result = createHttpHandler({ path: "/orders" }, vi.fn());

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.path).toBe("/orders");
    expect(meta).not.toHaveProperty("method");
  });
});

describe("schema support", () => {
  it("stores schema in metadata when provided", () => {
    // Arrange
    const bodySchema = { parse: (data: unknown) => data as { name: string } };

    // Act
    const result = createHttpHandler(
      { path: "/items", method: "POST", schema: { body: bodySchema } },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toEqual({ body: bodySchema });
  });

  it("omits schema from metadata when not provided", () => {
    // Act
    const result = createHttpHandler({ path: "/items", method: "GET" }, vi.fn());

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toBeUndefined();
  });

  it("stores query, params, and headers schemas in metadata", () => {
    // Arrange
    const querySchema = { parse: (data: unknown) => data as { page: string } };
    const paramsSchema = { parse: (data: unknown) => data as { id: string } };
    const headersSchema = { parse: (data: unknown) => data as { authorization: string } };

    // Act
    const result = createHttpHandler(
      {
        path: "/items/{id}",
        method: "GET",
        schema: { query: querySchema, params: paramsSchema, headers: headersSchema },
      },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    const schema = meta.schema as Record<string, unknown>;
    expect(schema.query).toBe(querySchema);
    expect(schema.params).toBe(paramsSchema);
    expect(schema.headers).toBe(headersSchema);
  });

  it("stores all four schema locations together", () => {
    // Arrange
    const bodySchema = { parse: (data: unknown) => data };
    const querySchema = { parse: (data: unknown) => data };
    const paramsSchema = { parse: (data: unknown) => data };
    const headersSchema = { parse: (data: unknown) => data };

    // Act
    const result = createHttpHandler(
      {
        path: "/items/{id}",
        method: "PUT",
        schema: { body: bodySchema, query: querySchema, params: paramsSchema, headers: headersSchema },
      },
      vi.fn(),
    );

    // Assert
    const meta = result.metadata as Record<string, unknown>;
    const schema = meta.schema as Record<string, unknown>;
    expect(schema.body).toBe(bodySchema);
    expect(schema.query).toBe(querySchema);
    expect(schema.params).toBe(paramsSchema);
    expect(schema.headers).toBe(headersSchema);
  });
});

describe("shorthand overloads with options", () => {
  it("httpPost accepts options object with schema", () => {
    // Arrange
    const bodySchema = { parse: (data: unknown) => data as { name: string } };

    // Act
    const result = httpPost("/items", { schema: { body: bodySchema } }, vi.fn());

    // Assert
    assertValidDefinition(result, "POST", "/items");
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toEqual({ body: bodySchema });
  });

  it("httpPost still works with simple handler-only form", () => {
    // Act
    const result = httpPost("/items", vi.fn());

    // Assert
    assertValidDefinition(result, "POST", "/items");
  });

  it("httpGet accepts options object with layers", () => {
    // Arrange
    class TestLayer implements CelerityLayer {
      async handle(
        _ctx: HandlerContext,
        next: () => Promise<HandlerResponse>,
      ): Promise<HandlerResponse> {
        return next();
      }
    }

    // Act
    const result = httpGet("/items", { layers: [TestLayer] }, vi.fn());

    // Assert
    assertValidDefinition(result, "GET", "/items");
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.layers).toEqual([TestLayer]);
  });

  it("httpPut accepts options object with schema", () => {
    // Arrange
    const bodySchema = { parse: (data: unknown) => data as { name: string } };

    // Act
    const result = httpPut("/items/{id}", { schema: { body: bodySchema } }, vi.fn());

    // Assert
    assertValidDefinition(result, "PUT", "/items/{id}");
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toEqual({ body: bodySchema });
  });

  it("httpPatch accepts options object with schema", () => {
    // Arrange
    const bodySchema = { parse: (data: unknown) => data as { name: string } };

    // Act
    const result = httpPatch("/items/{id}", { schema: { body: bodySchema } }, vi.fn());

    // Assert
    assertValidDefinition(result, "PATCH", "/items/{id}");
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.schema).toEqual({ body: bodySchema });
  });

  it("httpDelete accepts options object", () => {
    // Act
    const result = httpDelete("/items/{id}", { metadata: { action: "items:delete" } }, vi.fn());

    // Assert
    assertValidDefinition(result, "DELETE", "/items/{id}");
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.customMetadata).toEqual({ action: "items:delete" });
  });
});
