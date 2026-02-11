import type { LogLevel } from "@celerity-sdk/types";

export type TelemetryConfig = {
  tracingEnabled: boolean;
  otlpEndpoint: string;
  serviceName: string;
  serviceVersion: string;
  logLevel: LogLevel;
  logFormat: "json" | "human" | "auto";
  logFilePath: string | null;
};

const VALID_LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);
const VALID_LOG_FORMATS = new Set<string>(["json", "human", "auto"]);

export function readTelemetryEnv(): TelemetryConfig {
  const rawLevel = process.env.CELERITY_LOG_LEVEL;
  const rawFormat = process.env.CELERITY_LOG_FORMAT;

  return {
    tracingEnabled: process.env.CELERITY_TELEMETRY_ENABLED === "true",
    otlpEndpoint:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      process.env.CELERITY_TRACE_OTLP_COLLECTOR_ENDPOINT ??
      "http://otelcollector:4317",
    serviceName: process.env.OTEL_SERVICE_NAME ?? "celerity-app",
    serviceVersion: process.env.OTEL_SERVICE_VERSION ?? "0.0.0",
    logLevel: rawLevel && VALID_LOG_LEVELS.has(rawLevel) ? (rawLevel as LogLevel) : "info",
    logFormat:
      rawFormat && VALID_LOG_FORMATS.has(rawFormat)
        ? (rawFormat as "json" | "human" | "auto")
        : "auto",
    logFilePath: process.env.CELERITY_LOG_FILE_PATH ?? null,
  };
}
