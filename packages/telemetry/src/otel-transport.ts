import { Writable } from "node:stream";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const LEVEL_MAP: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
};

/**
 * Creates a main-thread writable stream that bridges pino log records
 * to the OTel Logs API.
 *
 * Runs in the main thread (NOT a pino worker-thread transport) so it can:
 * 1. Read traceId/spanId from the active OTel context (trace correlation)
 * 2. Flush reliably in Lambda (no worker thread lifecycle issues)
 */
export function createOTelStream(): Writable {
  const otelLogger = logs.getLogger("celerity");

  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const obj = JSON.parse(typeof chunk === "string" ? chunk : chunk.toString()) as Record<
          string,
          unknown
        >;
        const { level, msg, name, ...rest } = obj;
        delete rest.time;
        const attributes: Record<string, string | number | boolean> = {};
        if (typeof name === "string") attributes["logger.name"] = name;
        for (const [key, val] of Object.entries(rest)) {
          if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
            attributes[key] = val;
          }
        }
        otelLogger.emit({
          severityNumber: LEVEL_MAP[level as number] ?? SeverityNumber.INFO,
          body: msg as string,
          attributes,
        });
      } catch {
        // Malformed JSON — skip
      }
      callback();
    },
  });
}
