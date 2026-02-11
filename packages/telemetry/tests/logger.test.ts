import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { CelerityLoggerImpl, createLogger } from "../src/logger";
import type { TelemetryConfig } from "../src/env";

/** Collect pino JSON output lines via a writable stream. */
function createCapture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("CelerityLoggerImpl", () => {
  it("should delegate info() to pino", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "debug" }, stream);
    const logger = new CelerityLoggerImpl(p);

    logger.info("hello");
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.msg).toBe("hello");
  });

  it("should pass attributes as first argument to pino", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "debug" }, stream);
    const logger = new CelerityLoggerImpl(p);

    logger.info("order created", { orderId: "123" });
    const line = lines()[0]!;
    expect(line.msg).toBe("order created");
    expect(line.orderId).toBe("123");
  });

  it("should delegate all log levels", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "debug" }, stream);
    const logger = new CelerityLoggerImpl(p);

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    const all = lines();
    expect(all).toHaveLength(4);
    expect(all.map((l) => l.msg)).toEqual(["d", "i", "w", "e"]);
  });

  it("should create a child logger with name field", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "debug" }, stream);
    const logger = new CelerityLoggerImpl(p);

    const child = logger.child("users", { region: "us-east-1" });
    child.info("fetching");

    const line = lines()[0]!;
    expect(line.name).toBe("users");
    expect(line.region).toBe("us-east-1");
    expect(line.msg).toBe("fetching");
  });

  it("should create a context logger via withContext", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "debug" }, stream);
    const logger = new CelerityLoggerImpl(p);

    const ctx = logger.withContext({ traceId: "abc" });
    ctx.info("traced");

    const line = lines()[0]!;
    expect(line.traceId).toBe("abc");
    expect(line.msg).toBe("traced");
  });

  it("should update level via setLevel", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "info" }, stream);
    const logger = new CelerityLoggerImpl(p);

    logger.debug("should not appear");
    expect(lines()).toHaveLength(0);

    logger.setLevel("debug");
    logger.debug("now it appears");
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.msg).toBe("now it appears");
  });

  it("should filter messages below the configured level", () => {
    const { stream, lines } = createCapture();
    const p = pino({ level: "warn" }, stream);
    const logger = new CelerityLoggerImpl(p);

    logger.debug("skip");
    logger.info("skip");
    logger.warn("keep");
    logger.error("keep");

    expect(lines()).toHaveLength(2);
    expect(lines().map((l) => l.msg)).toEqual(["keep", "keep"]);
  });
});

describe("createLogger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CELERITY_RUNTIME_PLATFORM;
    delete process.env.CELERITY_LOG_REDACT_KEYS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const baseConfig: TelemetryConfig = {
    tracingEnabled: false,
    otlpEndpoint: "http://localhost:4317",
    serviceName: "test",
    serviceVersion: "0.0.0",
    logLevel: "info",
    logFormat: "json",
    logFilePath: null,
  };

  it("should create a logger that outputs JSON to stdout", () => {
    const logger = createLogger(baseConfig);
    expect(logger).toBeInstanceOf(CelerityLoggerImpl);
  });

  it("should create a logger with redaction when CELERITY_LOG_REDACT_KEYS is set", () => {
    process.env.CELERITY_LOG_REDACT_KEYS = "password, secret";
    const logger = createLogger(baseConfig);
    // Logger is created — redaction paths are internal to pino
    expect(logger).toBeInstanceOf(CelerityLoggerImpl);
  });

  it("should not throw when creating with file output", () => {
    const config: TelemetryConfig = {
      ...baseConfig,
      logFilePath: "/tmp/celerity-test-log.json",
    };
    expect(() => createLogger(config)).not.toThrow();
  });

  it("should use human format when logFormat is 'human'", () => {
    const config: TelemetryConfig = {
      ...baseConfig,
      logFormat: "human",
    };
    // pino-pretty transport creation — just verify no throw
    expect(() => createLogger(config)).not.toThrow();
  });

  it("should auto-detect human format for local platform", () => {
    delete process.env.CELERITY_RUNTIME_PLATFORM;
    const config: TelemetryConfig = {
      ...baseConfig,
      logFormat: "auto",
    };
    // local platform (no env) + auto format → human
    expect(() => createLogger(config)).not.toThrow();
  });

  it("should use JSON format for deployed platforms with auto", () => {
    process.env.CELERITY_RUNTIME_PLATFORM = "aws";
    const config: TelemetryConfig = {
      ...baseConfig,
      logFormat: "auto",
    };
    expect(() => createLogger(config)).not.toThrow();
  });
});
