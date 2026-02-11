import { describe, it, expect } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { HttpResponse } from "@celerity-sdk/types";
import {
  mapApiGatewayV2Event,
  mapHttpResponseToResult,
} from "../src/event-mapper";

// ---------------------------------------------------------------------------
// Helpers — factory for realistic APIGatewayProxyEventV2 objects
// ---------------------------------------------------------------------------

function createBaseEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /users/{id}",
    rawPath: "/users/42",
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
      host: "api.example.com",
      "user-agent": "TestAgent/1.0",
      "x-amzn-trace-id": "Root=1-abc-def",
    },
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "api.example.com",
      domainPrefix: "api",
      http: {
        method: "GET",
        path: "/users/42",
        protocol: "HTTP/1.1",
        sourceIp: "192.168.1.1",
        userAgent: "TestAgent/1.0",
      },
      requestId: "req-abc-123",
      routeKey: "GET /users/{id}",
      stage: "$default",
      time: "2026-01-15T10:30:00Z",
      timeEpoch: 1768470600000,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

// ===========================================================================
// mapApiGatewayV2Event
// ===========================================================================

describe("mapApiGatewayV2Event", () => {
  // ---------------------------------------------------------------
  // HTTP method mapping
  // ---------------------------------------------------------------
  describe("HTTP method", () => {
    it("maps the request method to uppercase", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.http.method = "post";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.method).toBe("POST");
    });

    it("preserves an already-uppercase method", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.http.method = "DELETE";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.method).toBe("DELETE");
    });
  });

  // ---------------------------------------------------------------
  // Path and route mapping
  // ---------------------------------------------------------------
  describe("path and route", () => {
    it("sets path from rawPath", () => {
      // Arrange
      const event = createBaseEvent({ rawPath: "/orders/99" });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.path).toBe("/orders/99");
    });

    it("sets matchedRoute from routeKey", () => {
      // Arrange
      const event = createBaseEvent({ routeKey: "POST /orders" });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.matchedRoute).toBe("POST /orders");
    });

    it("sets matchedRoute to null when routeKey is absent", () => {
      // Arrange
      const event = createBaseEvent();
      delete (event as unknown as Record<string, unknown>).routeKey;

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.matchedRoute).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Path parameters
  // ---------------------------------------------------------------
  describe("path parameters", () => {
    it("maps pathParameters to pathParams", () => {
      // Arrange
      const event = createBaseEvent({
        pathParameters: { id: "42", slug: "hello-world" },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.pathParams).toEqual({ id: "42", slug: "hello-world" });
    });

    it("returns an empty object when pathParameters is undefined", () => {
      // Arrange
      const event = createBaseEvent({ pathParameters: undefined });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.pathParams).toEqual({});
    });

    it("skips pathParameters entries with undefined values", () => {
      // Arrange
      const event = createBaseEvent({
        pathParameters: { id: "42", missing: undefined },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.pathParams).toEqual({ id: "42" });
      expect(request.pathParams).not.toHaveProperty("missing");
    });
  });

  // ---------------------------------------------------------------
  // Query string parameters
  // ---------------------------------------------------------------
  describe("query parameters", () => {
    it("maps queryStringParameters to query", () => {
      // Arrange
      const event = createBaseEvent({
        rawQueryString: "page=1&limit=10",
        queryStringParameters: { page: "1", limit: "10" },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.query).toEqual({ page: "1", limit: "10" });
    });

    it("defaults query to an empty object when queryStringParameters is absent", () => {
      // Arrange
      const event = createBaseEvent({ queryStringParameters: undefined });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.query).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // Headers
  // ---------------------------------------------------------------
  describe("headers", () => {
    it("lowercases header keys", () => {
      // Arrange
      const event = createBaseEvent({
        headers: {
          "Content-Type": "text/html",
          "X-Custom-Header": "custom-value",
        },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.headers["content-type"]).toBe("text/html");
      expect(request.headers["x-custom-header"]).toBe("custom-value");
    });

    it("skips header entries with undefined values", () => {
      // Arrange
      const event = createBaseEvent({
        headers: { "content-type": "application/json", "x-undefined": undefined },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.headers).toHaveProperty("content-type");
      expect(request.headers).not.toHaveProperty("x-undefined");
    });

    it("returns an empty headers object when event.headers is undefined", () => {
      // Arrange
      const event = createBaseEvent({ headers: undefined as unknown as Record<string, string> });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.headers).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // Content-type extraction
  // ---------------------------------------------------------------
  describe("contentType", () => {
    it("extracts contentType from lowercase headers", () => {
      // Arrange
      const event = createBaseEvent({
        headers: { "content-type": "application/xml" },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.contentType).toBe("application/xml");
    });

    it("returns null when no content-type header is present", () => {
      // Arrange
      const event = createBaseEvent({ headers: {} });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.contentType).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Cookies
  // ---------------------------------------------------------------
  describe("cookies", () => {
    it("parses cookie strings into a key-value record", () => {
      // Arrange
      const event = createBaseEvent({
        cookies: ["session=abc123", "theme=dark"],
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.cookies).toEqual({ session: "abc123", theme: "dark" });
    });

    it("handles cookies with values containing equals signs", () => {
      // Arrange
      const event = createBaseEvent({
        cookies: ["token=abc=def=ghi"],
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.cookies).toEqual({ token: "abc=def=ghi" });
    });

    it("trims whitespace from cookie names and values", () => {
      // Arrange
      const event = createBaseEvent({
        cookies: [" name = value "],
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.cookies).toEqual({ name: "value" });
    });

    it("skips malformed cookies without an equals sign", () => {
      // Arrange
      const event = createBaseEvent({
        cookies: ["valid=yes", "malformed", "also_valid=true"],
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.cookies).toEqual({ valid: "yes", also_valid: "true" });
    });

    it("returns an empty object when cookies are absent", () => {
      // Arrange
      const event = createBaseEvent({ cookies: undefined });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.cookies).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // Text body
  // ---------------------------------------------------------------
  describe("text body", () => {
    it("sets textBody when the body is present and not base64 encoded", () => {
      // Arrange
      const event = createBaseEvent({
        body: '{"name":"Alice"}',
        isBase64Encoded: false,
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.textBody).toBe('{"name":"Alice"}');
      expect(request.binaryBody).toBeNull();
    });

    it("sets textBody to null when body is absent", () => {
      // Arrange
      const event = createBaseEvent({ body: undefined });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.textBody).toBeNull();
      expect(request.binaryBody).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Binary body (base64)
  // ---------------------------------------------------------------
  describe("binary body", () => {
    it("decodes base64-encoded body into a Buffer", () => {
      // Arrange
      const originalPayload = "binary-content-here";
      const base64Payload = Buffer.from(originalPayload).toString("base64");
      const event = createBaseEvent({
        body: base64Payload,
        isBase64Encoded: true,
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.binaryBody).toBeInstanceOf(Buffer);
      expect(request.binaryBody!.toString()).toBe(originalPayload);
      expect(request.textBody).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Request metadata
  // ---------------------------------------------------------------
  describe("request metadata", () => {
    it("extracts requestId from requestContext", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.requestId = "unique-req-id";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.requestId).toBe("unique-req-id");
    });

    it("extracts requestTime from requestContext.time", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.time = "2026-02-08T12:00:00Z";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.requestTime).toBe("2026-02-08T12:00:00Z");
    });

    it("extracts clientIp from requestContext.http.sourceIp", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.http.sourceIp = "10.0.0.1";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.clientIp).toBe("10.0.0.1");
    });

    it("extracts userAgent from requestContext.http.userAgent", () => {
      // Arrange
      const event = createBaseEvent();
      event.requestContext.http.userAgent = "Mozilla/5.0";

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.userAgent).toBe("Mozilla/5.0");
    });

    it("sets userAgent to null when requestContext.http.userAgent is absent", () => {
      // Arrange
      const event = createBaseEvent();
      delete (event.requestContext.http as Record<string, unknown>).userAgent;

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.userAgent).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Trace context
  // ---------------------------------------------------------------
  describe("traceContext", () => {
    it("extracts traceContext from x-amzn-trace-id header", () => {
      // Arrange
      const event = createBaseEvent({
        headers: { "x-amzn-trace-id": "Root=1-abc-def" },
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.traceContext).toEqual({ "x-amzn-trace-id": "Root=1-abc-def" });
    });

    it("sets traceContext to null when x-amzn-trace-id header is absent", () => {
      // Arrange
      const event = createBaseEvent({ headers: {} });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.traceContext).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Auth (JWT authorizer)
  // ---------------------------------------------------------------
  describe("auth", () => {
    it("extracts JWT claims from requestContext.authorizer.jwt.claims", () => {
      // Arrange
      const event = createBaseEvent();
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: { sub: "user-123", email: "alice@example.com" },
        },
      };

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.auth).toEqual({
        sub: "user-123",
        email: "alice@example.com",
      });
    });

    it("sets auth to null when no authorizer is present", () => {
      // Arrange
      const event = createBaseEvent();

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.auth).toBeNull();
    });

    it("sets auth to null when authorizer has no jwt field", () => {
      // Arrange
      const event = createBaseEvent();
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {};

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.auth).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Full integration-style mapping
  // ---------------------------------------------------------------
  describe("full event mapping", () => {
    it("correctly maps all fields from a realistic API Gateway v2 event", () => {
      // Arrange
      const event = createBaseEvent({
        rawPath: "/users/42",
        rawQueryString: "include=profile",
        queryStringParameters: { include: "profile" },
        pathParameters: { id: "42" },
        headers: {
          "content-type": "application/json",
          authorization: "Bearer tok123",
          "x-amzn-trace-id": "Root=1-trace-id",
        },
        cookies: ["session=sess-abc"],
        body: '{"name":"Alice"}',
        isBase64Encoded: false,
        routeKey: "GET /users/{id}",
      });

      // Act
      const request = mapApiGatewayV2Event(event);

      // Assert
      expect(request.method).toBe("GET");
      expect(request.path).toBe("/users/42");
      expect(request.pathParams).toEqual({ id: "42" });
      expect(request.query).toEqual({ include: "profile" });
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.headers["authorization"]).toBe("Bearer tok123");
      expect(request.cookies).toEqual({ session: "sess-abc" });
      expect(request.textBody).toBe('{"name":"Alice"}');
      expect(request.binaryBody).toBeNull();
      expect(request.contentType).toBe("application/json");
      expect(request.requestId).toBe("req-abc-123");
      expect(request.requestTime).toBe("2026-01-15T10:30:00Z");
      expect(request.clientIp).toBe("192.168.1.1");
      expect(request.traceContext).toEqual({ "x-amzn-trace-id": "Root=1-trace-id" });
      expect(request.userAgent).toBe("TestAgent/1.0");
      expect(request.matchedRoute).toBe("GET /users/{id}");
    });
  });
});

// ===========================================================================
// mapHttpResponseToResult
// ===========================================================================

describe("mapHttpResponseToResult", () => {
  // ---------------------------------------------------------------
  // Status code
  // ---------------------------------------------------------------
  describe("status code", () => {
    it("maps the status field to statusCode", () => {
      // Arrange
      const response: HttpResponse = { status: 200 };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.statusCode).toBe(200);
    });

    it("maps non-200 status codes correctly", () => {
      // Arrange
      const response: HttpResponse = { status: 404 };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // Headers
  // ---------------------------------------------------------------
  describe("headers", () => {
    it("passes headers through to the result", () => {
      // Arrange
      const response: HttpResponse = {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "abc" },
      };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.headers).toEqual({
        "content-type": "application/json",
        "x-request-id": "abc",
      });
    });

    it("does not include a headers property when response.headers is undefined", () => {
      // Arrange
      const response: HttpResponse = { status: 204 };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.headers).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // Text body
  // ---------------------------------------------------------------
  describe("text body", () => {
    it("maps body string to result.body", () => {
      // Arrange
      const response: HttpResponse = {
        status: 200,
        body: '{"message":"ok"}',
      };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.body).toBe('{"message":"ok"}');
      expect(result.isBase64Encoded).toBeUndefined();
    });

    it("does not include body when response.body is undefined", () => {
      // Arrange
      const response: HttpResponse = { status: 204 };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.body).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // Binary body
  // ---------------------------------------------------------------
  describe("binary body", () => {
    it("base64-encodes binaryBody and sets isBase64Encoded flag", () => {
      // Arrange
      const binaryContent = Buffer.from("binary-file-content");
      const response: HttpResponse = {
        status: 200,
        binaryBody: binaryContent,
      };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.body).toBe(binaryContent.toString("base64"));
      expect(result.isBase64Encoded).toBe(true);
    });

    it("prefers binaryBody over body when both are present", () => {
      // Arrange
      const binaryContent = Buffer.from("binary-data");
      const response: HttpResponse = {
        status: 200,
        body: "text-body-should-be-ignored",
        binaryBody: binaryContent,
      };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result.body).toBe(binaryContent.toString("base64"));
      expect(result.isBase64Encoded).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Full response mapping
  // ---------------------------------------------------------------
  describe("full response mapping", () => {
    it("correctly maps a complete HttpResponse to APIGatewayProxyResultV2", () => {
      // Arrange
      const response: HttpResponse = {
        status: 201,
        headers: {
          "content-type": "application/json",
          location: "/users/99",
        },
        body: '{"id":99,"name":"Bob"}',
      };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result).toEqual({
        statusCode: 201,
        headers: {
          "content-type": "application/json",
          location: "/users/99",
        },
        body: '{"id":99,"name":"Bob"}',
      });
    });

    it("maps a minimal 204 No Content response", () => {
      // Arrange
      const response: HttpResponse = { status: 204 };

      // Act
      const result = mapHttpResponseToResult(response);

      // Assert
      expect(result).toEqual({ statusCode: 204 });
    });
  });
});
