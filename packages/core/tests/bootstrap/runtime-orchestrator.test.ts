import "reflect-metadata";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolve } from "node:path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

// Mock config returned by runtimeConfigFromEnv
const mockConfig = {
  blueprintConfigPath: "/path/to/blueprint.yaml",
  serviceName: "test-service",
  serverPort: 8080,
  platform: "local",
  testMode: false,
  traceOtlpCollectorEndpoint: "http://otelcollector:4317",
  runtimeMaxDiagnosticsLevel: "info",
  resourceStoreVerifyTls: true,
  resourceStoreCacheEntryTtl: 600,
  resourceStoreCleanupInterval: 3600,
};

// Mock the @celerity-sdk/runtime module
const mockSetup = vi.fn();
const mockRegisterHttpHandler = vi.fn();
const mockRun = vi.fn();
const mockShutdown = vi.fn();
const mockRuntimeConfigFromEnv = vi.fn((..._args: unknown[]) => mockConfig);

vi.mock("@celerity-sdk/runtime", () => ({
  CoreRuntimeApplication: vi.fn().mockImplementation(() => ({
    setup: mockSetup,
    registerHttpHandler: mockRegisterHttpHandler,
    run: mockRun,
    shutdown: mockShutdown,
  })),
  runtimeConfigFromEnv: (...args: unknown[]) => mockRuntimeConfigFromEnv(...args),
}));

// Import after mock setup
const { startRuntime } = await import("../../src/bootstrap/runtime-orchestrator");

beforeEach(() => {
  vi.clearAllMocks();
  mockRun.mockResolvedValue(undefined);
  mockRuntimeConfigFromEnv.mockReturnValue(mockConfig);
});

afterEach(() => {
  delete process.env.CELERITY_MODULE_PATH;
});

describe("startRuntime", () => {
  it("loads config from runtimeConfigFromEnv and passes it to CoreRuntimeApplication", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({ api: { http: { handlers: [] } } });

    await startRuntime();

    expect(mockRuntimeConfigFromEnv).toHaveBeenCalledOnce();
    const { CoreRuntimeApplication } = await import("@celerity-sdk/runtime");
    expect(CoreRuntimeApplication).toHaveBeenCalledWith(mockConfig);
  });

  it("defaults to block=true", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({ api: { http: { handlers: [] } } });

    await startRuntime();

    expect(mockRun).toHaveBeenCalledWith(true);
  });

  it("passes block=false when specified", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({ api: { http: { handlers: [] } } });

    await startRuntime({ block: false });

    expect(mockRun).toHaveBeenCalledWith(false);
  });

  it("registers handler callbacks for blueprint routes that match SDK handlers", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({
      api: {
        http: {
          handlers: [
            { path: "/health", method: "GET", timeout: 30, location: "./test", handler: "test.health" },
          ],
        },
      },
    });

    await startRuntime();

    expect(mockRegisterHttpHandler).toHaveBeenCalledTimes(1);
    expect(mockRegisterHttpHandler).toHaveBeenCalledWith(
      "/health",
      "GET",
      30,
      expect.any(Function),
    );
  });

  it("skips blueprint routes that have no matching SDK handler", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({
      api: {
        http: {
          handlers: [
            { path: "/health", method: "GET", timeout: 30, location: "./test", handler: "test.health" },
            { path: "/unknown", method: "POST", timeout: 60, location: "./test", handler: "test.unknown" },
          ],
        },
      },
    });

    await startRuntime();

    // Only /health should be registered, not /unknown
    expect(mockRegisterHttpHandler).toHaveBeenCalledTimes(1);
    expect(mockRegisterHttpHandler).toHaveBeenCalledWith(
      "/health",
      "GET",
      30,
      expect.any(Function),
    );
  });

  it("handles empty handler list from blueprint", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({ api: { http: { handlers: [] } } });

    await startRuntime();

    expect(mockRegisterHttpHandler).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it("handles missing api config from blueprint", async () => {
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "test-module.ts");

    mockSetup.mockReturnValue({});

    await startRuntime();

    expect(mockRegisterHttpHandler).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it("resolves handler via module reference when not matched by path or ID", async () => {
    // Use no-id-module: the greet handler is registered in @Module without an ID
    // and without path/method, so neither createRouteCallback nor direct
    // getHandlerById will match. The module resolution fallback should resolve it.
    process.env.CELERITY_MODULE_PATH = resolve(fixturesDir, "no-id-module.ts");

    mockSetup.mockReturnValue({
      api: {
        http: {
          handlers: [
            {
              path: "/greet",
              method: "GET",
              timeout: 30,
              location: fixturesDir,
              handler: "no-id-handlers.greet",
            },
          ],
        },
      },
    });

    await startRuntime();

    expect(mockRegisterHttpHandler).toHaveBeenCalledTimes(1);
    expect(mockRegisterHttpHandler).toHaveBeenCalledWith(
      "/greet",
      "GET",
      30,
      expect.any(Function),
    );
  });
});
