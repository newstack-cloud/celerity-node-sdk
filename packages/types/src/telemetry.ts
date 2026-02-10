export type LogLevel = "debug" | "info" | "warn" | "error";

/** Multi-backend logger available via DI. Always works regardless of tracing. */
export interface CelerityLogger {
  debug(message: string, attributes?: Record<string, unknown>): void;
  info(message: string, attributes?: Record<string, unknown>): void;
  warn(message: string, attributes?: Record<string, unknown>): void;
  error(message: string, attributes?: Record<string, unknown>): void;

  /** Create a named child logger. Adds the name to all log records. */
  child(name: string, attributes?: Record<string, unknown>): CelerityLogger;

  /** Create a logger enriched with additional context attributes. */
  withContext(attributes: Record<string, unknown>): CelerityLogger;
}

/** Wrapper around OTel tracing for custom span capture. */
export interface CelerityTracer {
  startSpan(name: string, attributes?: Record<string, unknown>): CeleritySpan;
  withSpan<T>(
    name: string,
    fn: (span: CeleritySpan) => T | Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T>;
}

export interface CeleritySpan {
  setAttribute(key: string, value: string | number | boolean): void;
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  recordError(error: Error): void;
  setOk(): void;
  end(): void;
}
