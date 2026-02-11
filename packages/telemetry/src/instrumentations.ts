import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import type { Instrumentation } from "@opentelemetry/instrumentation";

export async function buildInstrumentations(): Promise<Instrumentation[]> {
  // Core instrumentation: always active — covers all HTTP/HTTPS and fetch() calls
  const instrumentations: Instrumentation[] = [
    new HttpInstrumentation() as Instrumentation,
    new UndiciInstrumentation() as Instrumentation,
  ];

  // Dynamically load optional instrumentation packages.
  // Each targets a specific library and silently no-ops if the library isn't installed.
  const optionalPackages = [
    "@opentelemetry/instrumentation-aws-sdk",
    "@opentelemetry/instrumentation-ioredis",
    "@opentelemetry/instrumentation-pg",
    "@opentelemetry/instrumentation-mysql2",
  ];

  for (const name of optionalPackages) {
    try {
      const pkg = name;
      const mod = (await import(pkg)) as Record<string, unknown>;
      const InstrumentationClass = findInstrumentationExport(mod);
      if (InstrumentationClass) {
        instrumentations.push(new InstrumentationClass() as Instrumentation);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
        console.warn(`[celerity] Failed to load optional instrumentation ${name}:`, err);
      }
    }
  }

  return instrumentations;
}

function findInstrumentationExport(mod: Record<string, unknown>): (new () => unknown) | null {
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype && "enable" in value.prototype) {
      return value as new () => unknown;
    }
  }
  return null;
}
