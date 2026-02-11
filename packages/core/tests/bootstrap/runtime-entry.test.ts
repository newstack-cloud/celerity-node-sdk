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

  it("creates a route callback by handler ID", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = await result.createRouteCallbackById("app.module.getOrder");
    expect(callback).toBeTypeOf("function");
  });

  it("returns null for an unmatched handler ID", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = await result.createRouteCallbackById("app.module.nonexistent");
    expect(callback).toBeNull();
  });

  it("ID-based route callback maps request and returns response", async () => {
    const modulePath = resolve(fixturesDir, "test-module.ts");
    const result = await bootstrapForRuntime(modulePath);

    const callback = await result.createRouteCallbackById("app.module.getOrder");
    expect(callback).not.toBeNull();

    const mockRequest = {
      method: "GET",
      path: "/orders/abc-123",
      pathParams: { orderId: "abc-123" },
      query: {} as Record<string, string[]>,
      headers: {} as Record<string, string[]>,
      cookies: {},
      textBody: null,
      binaryBody: null,
      contentType: "",
      requestId: "test-req-2",
      requestTime: "2026-01-01T00:00:00Z",
      auth: null,
      clientIp: "127.0.0.1",
      traceContext: null,
      userAgent: "test",
      matchedRoute: "/orders/{orderId}",
      httpVersion: "HTTP/1.1",
      uri: "/orders/abc-123",
    };

    const response = await callback!(null, mockRequest as never);

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    const body = JSON.parse(response.body!);
    expect(body).toEqual({ orderId: "abc-123" });
  });

  describe("module resolution fallback", () => {
    it("resolves a plain function export via dynamic import", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById(
        "standalone-handlers.hello",
        fixturesDir,
      );
      expect(callback).toBeTypeOf("function");
    });

    it("resolves a FunctionHandlerDefinition export via dynamic import", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById(
        "standalone-handlers.goodbye",
        fixturesDir,
      );
      expect(callback).toBeTypeOf("function");
    });

    it("matches registry handler by function reference and assigns ID", async () => {
      const modulePath = resolve(fixturesDir, "no-id-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      // The greet handler is in the registry (registered via @Module) but has no id.
      const handler = result.registry.getAllHandlers().find((h) => h.isFunctionHandler);
      expect(handler).toBeDefined();
      expect(handler!.id).toBeUndefined();

      // The fallback imports the module, gets the exported handler function,
      // and matches it by reference (===) to the registry entry.
      const callback = await result.createRouteCallbackById(
        "no-id-handlers.greet",
        fixturesDir,
      );
      expect(callback).toBeTypeOf("function");

      // Verify the ID was assigned to the registry handler for consistency.
      expect(handler!.id).toBe("no-id-handlers.greet");
    });

    it("resolves default export when handler reference has no dot", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById("default-handler", fixturesDir);
      expect(callback).toBeTypeOf("function");
    });

    it("resolves dotted module name as default export when named split fails", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      // "dotted.module" has a dot, so the code first tries module="dotted", export="module"
      // which fails (no "dotted" module), then falls back to treating the full string
      // "dotted.module" as a module name and resolves the default export.
      const callback = await result.createRouteCallbackById("dotted.module", fixturesDir);
      expect(callback).toBeTypeOf("function");
    });

    it("returns null when module does not exist", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById(
        "nonexistent-module.handler",
        fixturesDir,
      );
      expect(callback).toBeNull();
    });

    it("returns null when export does not exist in module", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById(
        "standalone-handlers.missingExport",
        fixturesDir,
      );
      expect(callback).toBeNull();
    });

    it("returns null when export is not a function", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      const callback = await result.createRouteCallbackById(
        "standalone-handlers.notAHandler",
        fixturesDir,
      );
      expect(callback).toBeNull();
    });

    it("uses moduleDir as fallback when no codeLocation is provided", async () => {
      const modulePath = resolve(fixturesDir, "test-module.ts");
      const result = await bootstrapForRuntime(modulePath);

      // moduleDir is dirname of the modulePath (fixturesDir), so this should
      // resolve standalone-handlers from the fixtures directory.
      const callback = await result.createRouteCallbackById("standalone-handlers.hello");
      expect(callback).toBeTypeOf("function");
    });
  });
});
