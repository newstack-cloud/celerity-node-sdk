import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  Body,
  Query,
  Param,
  Headers,
  Auth,
  Req,
  Cookies,
  RequestId,
  extractParam,
} from "../../src/decorators/params";
import type { ParamMetadata } from "../../src/decorators/params";
import { PARAM_METADATA } from "../../src/metadata/constants";
import type { HttpRequest } from "@celerity-sdk/types";

// ---------------------------------------------------------------------------
// Helper to build a minimal HttpRequest for extractParam tests
// ---------------------------------------------------------------------------

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
    requestId: "req-abc-123",
    requestTime: new Date().toISOString(),
    auth: null,
    clientIp: "127.0.0.1",
    traceContext: null,
    userAgent: "test-agent",
    matchedRoute: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to retrieve param metadata from a handler method
// ---------------------------------------------------------------------------

function getParamMeta(target: object, method: string): ParamMetadata[] {
  return Reflect.getOwnMetadata(PARAM_METADATA, target, method) ?? [];
}

// ---------------------------------------------------------------------------
// Decorator metadata tests
// ---------------------------------------------------------------------------

describe("@Body", () => {
  it("should store param metadata with type 'body'", () => {
    // Arrange & Act
    class Handler {
      handle(@Body() _body: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params).toHaveLength(1);
    expect(params[0].type).toBe("body");
    expect(params[0].index).toBe(0);
  });

  it("should store a schema when provided", () => {
    // Arrange
    const schema = { parse: (data: unknown) => data };

    // Act
    class Handler {
      handle(@Body(schema) _body: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].schema).toBe(schema);
  });
});

describe("@Query", () => {
  it("should store param metadata with type 'query' and no key", () => {
    // Arrange & Act
    class Handler {
      search(@Query() _q: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "search");
    expect(params).toHaveLength(1);
    expect(params[0].type).toBe("query");
    expect(params[0].key).toBeUndefined();
  });

  it("should store the specified key", () => {
    // Arrange & Act
    class Handler {
      search(@Query("page") _page: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "search");
    expect(params[0].key).toBe("page");
  });

  it("should store both key and schema", () => {
    // Arrange
    const schema = { parse: (data: unknown) => data };

    // Act
    class Handler {
      search(@Query("page", schema) _page: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "search");
    expect(params[0].key).toBe("page");
    expect(params[0].schema).toBe(schema);
  });
});

describe("@Param", () => {
  it("should store param metadata with type 'param'", () => {
    // Arrange & Act
    class Handler {
      getOne(@Param("id") _id: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "getOne");
    expect(params).toHaveLength(1);
    expect(params[0].type).toBe("param");
    expect(params[0].key).toBe("id");
  });
});

describe("@Headers", () => {
  it("should store param metadata with type 'headers'", () => {
    // Arrange & Act
    class Handler {
      handle(@Headers("authorization") _auth: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("headers");
    expect(params[0].key).toBe("authorization");
  });

  it("should store no key when none is given", () => {
    // Arrange & Act
    class Handler {
      handle(@Headers() _headers: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("headers");
    expect(params[0].key).toBeUndefined();
  });
});

describe("@Auth", () => {
  it("should store param metadata with type 'auth'", () => {
    // Arrange & Act
    class Handler {
      handle(@Auth() _auth: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("auth");
  });
});

describe("@Req", () => {
  it("should store param metadata with type 'request'", () => {
    // Arrange & Act
    class Handler {
      handle(@Req() _req: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("request");
  });
});

describe("@Cookies", () => {
  it("should store param metadata with type 'cookies' and optional key", () => {
    // Arrange & Act
    class Handler {
      handle(@Cookies("session") _cookie: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("cookies");
    expect(params[0].key).toBe("session");
  });
});

describe("@RequestId", () => {
  it("should store param metadata with type 'requestId'", () => {
    // Arrange & Act
    class Handler {
      handle(@RequestId() _id: unknown) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params[0].type).toBe("requestId");
  });
});

describe("multiple param decorators on one method", () => {
  it("should accumulate metadata for all decorated parameters", () => {
    // Arrange & Act
    class Handler {
      handle(
        @Body() _body: unknown,
        @Query("page") _page: unknown,
        @Param("id") _id: unknown,
      ) {}
    }

    // Assert
    const params = getParamMeta(Handler.prototype, "handle");
    expect(params).toHaveLength(3);

    const types = params.map((p) => p.type);
    expect(types).toContain("body");
    expect(types).toContain("query");
    expect(types).toContain("param");
  });
});

// ---------------------------------------------------------------------------
// extractParam function tests
// ---------------------------------------------------------------------------

describe("extractParam", () => {
  describe("body", () => {
    it("should parse JSON from textBody", () => {
      // Arrange
      const request = makeRequest({
        textBody: JSON.stringify({ name: "Alice" }),
      });

      // Act
      const result = extractParam("body", undefined, request);

      // Assert
      expect(result).toEqual({ name: "Alice" });
    });

    it("should return null when textBody is null", () => {
      // Arrange
      const request = makeRequest({ textBody: null });

      // Act
      const result = extractParam("body", undefined, request);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("query", () => {
    it("should return a specific query value when key is provided", () => {
      // Arrange
      const request = makeRequest({ query: { page: "2", limit: "10" } });

      // Act
      const result = extractParam("query", "page", request);

      // Assert
      expect(result).toBe("2");
    });

    it("should return the entire query object when no key is provided", () => {
      // Arrange
      const query = { page: "1", sort: "name" };
      const request = makeRequest({ query });

      // Act
      const result = extractParam("query", undefined, request);

      // Assert
      expect(result).toEqual(query);
    });
  });

  describe("param", () => {
    it("should return a specific path param when key is provided", () => {
      // Arrange
      const request = makeRequest({ pathParams: { id: "42" } });

      // Act
      const result = extractParam("param", "id", request);

      // Assert
      expect(result).toBe("42");
    });

    it("should return all path params when no key is provided", () => {
      // Arrange
      const pathParams = { id: "42", slug: "hello" };
      const request = makeRequest({ pathParams });

      // Act
      const result = extractParam("param", undefined, request);

      // Assert
      expect(result).toEqual(pathParams);
    });
  });

  describe("headers", () => {
    it("should return a specific header when key is provided", () => {
      // Arrange
      const request = makeRequest({
        headers: { authorization: "Bearer xyz" },
      });

      // Act
      const result = extractParam("headers", "authorization", request);

      // Assert
      expect(result).toBe("Bearer xyz");
    });

    it("should return all headers when no key is provided", () => {
      // Arrange
      const headers = { "content-type": "application/json", accept: "*/*" };
      const request = makeRequest({ headers });

      // Act
      const result = extractParam("headers", undefined, request);

      // Assert
      expect(result).toEqual(headers);
    });
  });

  describe("auth", () => {
    it("should return the auth object from the request", () => {
      // Arrange
      const auth = { sub: "user-1", role: "admin" };
      const request = makeRequest({ auth });

      // Act
      const result = extractParam("auth", undefined, request);

      // Assert
      expect(result).toEqual(auth);
    });

    it("should return null when auth is not set", () => {
      // Arrange
      const request = makeRequest({ auth: null });

      // Act
      const result = extractParam("auth", undefined, request);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("request", () => {
    it("should return the entire request object", () => {
      // Arrange
      const request = makeRequest({ path: "/hello" });

      // Act
      const result = extractParam("request", undefined, request);

      // Assert
      expect(result).toBe(request);
    });
  });

  describe("cookies", () => {
    it("should return a specific cookie when key is provided", () => {
      // Arrange
      const request = makeRequest({
        cookies: { session: "abc123", theme: "dark" },
      });

      // Act
      const result = extractParam("cookies", "session", request);

      // Assert
      expect(result).toBe("abc123");
    });

    it("should return all cookies when no key is provided", () => {
      // Arrange
      const cookies = { session: "abc123", theme: "dark" };
      const request = makeRequest({ cookies });

      // Act
      const result = extractParam("cookies", undefined, request);

      // Assert
      expect(result).toEqual(cookies);
    });
  });

  describe("requestId", () => {
    it("should return the requestId from the request", () => {
      // Arrange
      const request = makeRequest({ requestId: "req-xyz-789" });

      // Act
      const result = extractParam("requestId", undefined, request);

      // Assert
      expect(result).toBe("req-xyz-789");
    });
  });
});
