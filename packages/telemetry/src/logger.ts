import pino from "pino";
import type { CelerityLogger, LogLevel } from "@celerity-sdk/types";
import type { TelemetryConfig } from "./env";
import { createOTelStream } from "./otel-transport";

/**
 * Thin pino wrapper implementing CelerityLogger.
 * Every method delegates directly to the underlying pino instance.
 */
export class CelerityLoggerImpl implements CelerityLogger {
  constructor(private pinoLogger: pino.Logger) {}

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log("debug", message, attributes);
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.log("info", message, attributes);
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log("warn", message, attributes);
  }

  error(message: string, attributes?: Record<string, unknown>): void {
    this.log("error", message, attributes);
  }

  private log(level: LogLevel, message: string, attributes?: Record<string, unknown>): void {
    const fn = this.pinoLogger[level].bind(this.pinoLogger);
    if (attributes) fn(attributes, message);
    else fn(message);
  }

  child(name: string, attributes?: Record<string, unknown>): CelerityLogger {
    return new CelerityLoggerImpl(this.pinoLogger.child({ name, ...attributes }));
  }

  withContext(attributes: Record<string, unknown>): CelerityLogger {
    return new CelerityLoggerImpl(this.pinoLogger.child(attributes));
  }

  /** Update the log level at runtime. Internal — used by TelemetryLayer for dynamic config. */
  setLevel(level: LogLevel): void {
    this.pinoLogger.level = level;
  }
}

export function createLogger(config: TelemetryConfig): CelerityLoggerImpl {
  const streams: pino.StreamEntry[] = [];

  const isLocal = !process.env.CELERITY_PLATFORM || process.env.CELERITY_PLATFORM === "local";
  const useHumanFormat = config.logFormat === "human" || (config.logFormat === "auto" && isLocal);

  if (useHumanFormat) {
    // pino-pretty via worker thread — fine for local dev only
    streams.push({
      level: config.logLevel,
      stream: pino.transport({ target: "pino-pretty", options: { destination: 1 } }),
    });
  } else {
    // Raw JSON to stdout — synchronous, Lambda-safe
    streams.push({ level: config.logLevel, stream: pino.destination(1) });
  }

  // File stream — if configured (synchronous SonicBoom destination)
  if (config.logFilePath) {
    streams.push({
      level: config.logLevel,
      stream: pino.destination(config.logFilePath),
    });
  }

  // OTel log stream — main-thread writable (NOT worker-thread transport).
  // Runs in main thread so it can read active OTel context (traceId/spanId)
  // and is safe for Lambda (no worker thread flush issues).
  if (config.tracingEnabled) {
    streams.push({
      level: config.logLevel,
      stream: createOTelStream(),
    });
  }

  const redactPaths = resolveRedactPaths();

  const logger = pino(
    {
      level: config.logLevel,
      redact: redactPaths.length > 0 ? { paths: redactPaths, censor: "[REDACTED]" } : undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams),
  );

  return new CelerityLoggerImpl(logger);
}

function resolveRedactPaths(): string[] {
  const keys = process.env.CELERITY_LOG_REDACT_KEYS;
  if (!keys) return [];
  return keys.split(",").map((k) => k.trim());
}
