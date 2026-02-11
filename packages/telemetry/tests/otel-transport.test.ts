import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmit = vi.fn();
vi.mock("@opentelemetry/api-logs", () => ({
  logs: {
    getLogger: () => ({ emit: mockEmit }),
  },
  SeverityNumber: {
    TRACE: 1,
    DEBUG: 5,
    INFO: 9,
    WARN: 13,
    ERROR: 17,
    FATAL: 21,
  },
}));

// Import after mock setup
const { createOTelStream } = await import("../src/otel-transport");

describe("createOTelStream", () => {
  beforeEach(() => {
    mockEmit.mockClear();
  });

  it("should emit log records to OTel logger", () =>
    new Promise<void>((resolve) => {
      const stream = createOTelStream();
      const record = JSON.stringify({
        level: 30,
        msg: "test message",
        time: Date.now(),
        name: "app",
        extra: "data",
      });

      stream.write(record, () => {
        expect(mockEmit).toHaveBeenCalledTimes(1);
        const call = mockEmit.mock.calls[0]![0];
        expect(call.severityNumber).toBe(9); // INFO
        expect(call.body).toBe("test message");
        expect(call.attributes["logger.name"]).toBe("app");
        expect(call.attributes.extra).toBe("data");
        resolve();
      });
    }));

  it("should map pino levels to OTel severity numbers", () =>
    new Promise<void>((resolve) => {
      const stream = createOTelStream();
      const levels = [
        { pinoLevel: 10, otelSeverity: 1 }, // trace
        { pinoLevel: 20, otelSeverity: 5 }, // debug
        { pinoLevel: 30, otelSeverity: 9 }, // info
        { pinoLevel: 40, otelSeverity: 13 }, // warn
        { pinoLevel: 50, otelSeverity: 17 }, // error
        { pinoLevel: 60, otelSeverity: 21 }, // fatal
      ];

      let written = 0;
      for (const { pinoLevel } of levels) {
        stream.write(
          JSON.stringify({ level: pinoLevel, msg: `level-${pinoLevel}`, time: Date.now() }),
          () => {
            written++;
            if (written === levels.length) {
              expect(mockEmit).toHaveBeenCalledTimes(levels.length);
              for (let i = 0; i < levels.length; i++) {
                expect(mockEmit.mock.calls[i]![0].severityNumber).toBe(levels[i]!.otelSeverity);
              }
              resolve();
            }
          },
        );
      }
    }));

  it("should omit logger.name when name is not present", () =>
    new Promise<void>((resolve) => {
      const stream = createOTelStream();
      const record = JSON.stringify({ level: 30, msg: "no name", time: Date.now() });

      stream.write(record, () => {
        const call = mockEmit.mock.calls[0]![0];
        expect(call.attributes).not.toHaveProperty("logger.name");
        resolve();
      });
    }));

  it("should skip malformed JSON without throwing", () =>
    new Promise<void>((resolve) => {
      const stream = createOTelStream();
      stream.write("not json at all{{{", () => {
        expect(mockEmit).not.toHaveBeenCalled();
        resolve();
      });
    }));

  it("should handle Buffer input", () =>
    new Promise<void>((resolve) => {
      const stream = createOTelStream();
      const record = Buffer.from(
        JSON.stringify({ level: 30, msg: "buffer input", time: Date.now() }),
      );

      stream.write(record, () => {
        expect(mockEmit).toHaveBeenCalledTimes(1);
        expect(mockEmit.mock.calls[0]![0].body).toBe("buffer input");
        resolve();
      });
    }));
});
