import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockStart = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  })),
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn().mockImplementation((attrs: unknown) => ({ attributes: attrs })),
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
  ATTR_SERVICE_VERSION: "service.version",
}));

vi.mock("@opentelemetry/exporter-trace-otlp-grpc", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-logs-otlp-grpc", () => ({
  OTLPLogExporter: vi.fn(),
}));

vi.mock("@opentelemetry/core", () => ({
  CompositePropagator: vi.fn(),
  W3CTraceContextPropagator: vi.fn(),
}));

vi.mock("@opentelemetry/propagator-aws-xray", () => ({
  AWSXRayPropagator: vi.fn(),
}));

vi.mock("@opentelemetry/id-generator-aws-xray", () => ({
  AWSXRayIdGenerator: vi.fn(),
}));

vi.mock("../src/instrumentations", () => ({
  buildInstrumentations: vi.fn().mockResolvedValue([]),
}));

describe("init", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module state by re-importing
    vi.resetModules();
    delete process.env.CELERITY_TELEMETRY_ENABLED;
    delete process.env.CELERITY_PLATFORM;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should not initialize when tracing is disabled", async () => {
    const { initTelemetry, isInitialized } = await import("../src/init");
    await initTelemetry();
    expect(isInitialized()).toBe(false);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("should initialize when tracing is enabled", async () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    const { initTelemetry, isInitialized } = await import("../src/init");
    await initTelemetry();
    expect(isInitialized()).toBe(true);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("should be idempotent — second call is a no-op", async () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    const { initTelemetry } = await import("../src/init");
    await initTelemetry();
    await initTelemetry();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("should shutdown and reset state", async () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    const { initTelemetry, shutdownTelemetry, isInitialized } = await import("../src/init");
    await initTelemetry();
    expect(isInitialized()).toBe(true);

    await shutdownTelemetry();
    expect(mockShutdown).toHaveBeenCalledTimes(1);
    expect(isInitialized()).toBe(false);
  });

  it("should be safe to call shutdown when not initialized", async () => {
    const { shutdownTelemetry } = await import("../src/init");
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
    expect(mockShutdown).not.toHaveBeenCalled();
  });
});
