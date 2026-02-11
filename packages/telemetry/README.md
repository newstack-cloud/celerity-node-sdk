# @celerity-sdk/telemetry

Observability layer for the Celerity Node SDK — pino-based structured logging and OpenTelemetry-based distributed tracing.

## Installation

```bash
pnpm add @celerity-sdk/telemetry
```

## Key Concepts

### TelemetryLayer

A system layer that initialises the logger and tracer, registers them in the DI container, and propagates request-scoped loggers via `AsyncLocalStorage`.

Self-configures from environment variables:

| Variable | Description |
|---|---|
| `CELERITY_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) |
| `CELERITY_LOG_FILE` | Optional file path for log output |
| `CELERITY_OTEL_ENABLED` | Enable OpenTelemetry (`true`/`false`) |
| `OTEL_SERVICE_NAME` | Service name for OTel resource |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel collector endpoint |

### Logging

Pino-based structured logger with multistream output: console (with `pino-pretty` for local development), optional file, and an OTel Logs bridge.

```typescript
import { LOGGER_TOKEN } from "@celerity-sdk/telemetry";

@Injectable()
class OrderService {
  constructor(@Inject(LOGGER_TOKEN) private logger: CelerityLogger) {}

  getOrder(id: string) {
    this.logger.info("Fetching order", { orderId: id });
  }
}
```

### Request-Scoped Logging

The `ContextAwareLogger` proxy automatically includes request context (trace ID, request ID) in log entries. For code outside the DI container, use `getRequestLogger()`.

### Tracing

OpenTelemetry SDK integration with automatic instrumentation. Enhanced instrumentations for AWS SDK, ioredis, pg, and mysql2 are loaded dynamically when available as peer dependencies.

```typescript
import { TRACER_TOKEN } from "@celerity-sdk/telemetry";

@Injectable()
class OrderService {
  constructor(@Inject(TRACER_TOKEN) private tracer: CelerityTracer) {}

  async getOrder(id: string) {
    return this.tracer.startSpan("getOrder", async (span) => {
      span.setAttribute("orderId", id);
      // ...
    });
  }
}
```

### DI Tokens

| Token | Type | Description |
|---|---|
| `LOGGER_TOKEN` | `CelerityLogger` | Request-aware structured logger |
| `TRACER_TOKEN` | `CelerityTracer` | Distributed tracer |

### OTel Setup (ESM-only)

For applications that need early OTel SDK initialisation (before any instrumented imports), import the setup entry point:

```typescript
import "@celerity-sdk/telemetry/setup";
```

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.
