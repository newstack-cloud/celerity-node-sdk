import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readTelemetryEnv } from "../src/env";

describe("readTelemetryEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all telemetry-related env vars
    delete process.env.CELERITY_TELEMETRY_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.CELERITY_LOG_LEVEL;
    delete process.env.CELERITY_LOG_FORMAT;
    delete process.env.CELERITY_LOG_FILE_PATH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return defaults when no env vars are set", () => {
    const config = readTelemetryEnv();

    expect(config.tracingEnabled).toBe(false);
    expect(config.otlpEndpoint).toBe("http://otelcollector:4317");
    expect(config.serviceName).toBe("celerity-app");
    expect(config.serviceVersion).toBe("0.0.0");
    expect(config.logLevel).toBe("info");
    expect(config.logFormat).toBe("auto");
    expect(config.logFilePath).toBeNull();
  });

  it("should enable tracing when CELERITY_TELEMETRY_ENABLED is 'true'", () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "true";
    expect(readTelemetryEnv().tracingEnabled).toBe(true);
  });

  it("should not enable tracing for non-'true' values", () => {
    process.env.CELERITY_TELEMETRY_ENABLED = "yes";
    expect(readTelemetryEnv().tracingEnabled).toBe(false);

    process.env.CELERITY_TELEMETRY_ENABLED = "1";
    expect(readTelemetryEnv().tracingEnabled).toBe(false);
  });

  it("should prefer OTEL_EXPORTER_OTLP_ENDPOINT over CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://otel:4317";
    process.env.CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT = "http://celerity:4317";

    expect(readTelemetryEnv().otlpEndpoint).toBe("http://otel:4317");
  });

  it("should fall back to CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT when OTEL_ is not set", () => {
    process.env.CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT = "http://celerity:4317";

    expect(readTelemetryEnv().otlpEndpoint).toBe("http://celerity:4317");
  });

  it("should read OTEL_SERVICE_NAME", () => {
    process.env.OTEL_SERVICE_NAME = "my-service";
    expect(readTelemetryEnv().serviceName).toBe("my-service");
  });

  it("should read OTEL_SERVICE_VERSION", () => {
    process.env.OTEL_SERVICE_VERSION = "1.2.3";
    expect(readTelemetryEnv().serviceVersion).toBe("1.2.3");
  });

  it("should read CELERITY_LOG_LEVEL", () => {
    process.env.CELERITY_LOG_LEVEL = "debug";
    expect(readTelemetryEnv().logLevel).toBe("debug");
  });

  it("should read CELERITY_LOG_FORMAT", () => {
    process.env.CELERITY_LOG_FORMAT = "json";
    expect(readTelemetryEnv().logFormat).toBe("json");

    process.env.CELERITY_LOG_FORMAT = "human";
    expect(readTelemetryEnv().logFormat).toBe("human");
  });

  it("should read CELERITY_LOG_FILE_PATH", () => {
    process.env.CELERITY_LOG_FILE_PATH = "/var/log/app.log";
    expect(readTelemetryEnv().logFilePath).toBe("/var/log/app.log");
  });
});
