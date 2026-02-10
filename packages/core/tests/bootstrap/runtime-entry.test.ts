import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { bootstrapForRuntime } from "../../src/bootstrap/runtime-entry";
import { Container } from "../../src/di/container";
import { HandlerRegistry } from "../../src/handlers/registry";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

afterEach(() => {
  delete process.env.CELERITY_MODULE_PATH;
});

describe("bootstrapForRuntime", () => {
  it("bootstraps the module and returns registry and container", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    expect(result.container).toBeInstanceOf(Container);
    expect(result.registry).toBeInstanceOf(HandlerRegistry);
  });

  it("creates a route callback for a matching handler", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = result.createRouteCallback("/health", "GET");
    expect(callback).toBeTypeOf("function");
  });

  it("returns null for an unmatched route", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = result.createRouteCallback("/nonexistent", "GET");
    expect(callback).toBeNull();
  });

  it("route callback maps runtime request and returns runtime response", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = result.createRouteCallback("/health", "GET");
    expect(callback).not.toBeNull();

    // Create a mock runtime Request-like object
    const mockRequest = {
      method: "GET",
      path: "/health",
      pathParams: {},
      query: {} as Record<string, string[]>,
      headers: {} as Record<string, string[]>,
      cookies: {},
      textBody: null,
      binaryBody: null,
      contentType: "",
      requestId: "test-req-1",
      requestTime: "2026-01-01T00:00:00Z",
      auth: null,
      clientIp: "127.0.0.1",
      traceContext: null,
      userAgent: "test",
      matchedRoute: "/health",
      httpVersion: "HTTP/1.1",
      uri: "/health",
    };

    const response = await callback!(null, mockRequest as never);

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    const body = JSON.parse(response.body!);
    expect(body).toEqual({ ok: true });
  });

  it("uses CELERITY_MODULE_PATH env var when no explicit path", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime();

    expect(result.registry.getHandler("/health", "GET")).toBeDefined();
  });
});
