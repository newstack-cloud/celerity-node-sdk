import createDebug from "debug";
import { context as otelContext } from "@opentelemetry/api";
import type {
  CelerityLayer,
  BaseHandlerContext,
  HttpHandlerContext,
  HttpRequest,
  LogLevel,
  ServiceContainer,
} from "@celerity-sdk/types";
import { extractUserId } from "@celerity-sdk/common";
import { readTelemetryEnv, type TelemetryConfig } from "./env";
import { initTelemetry, shutdownTelemetry } from "./init";
import { CelerityLoggerImpl, createLogger } from "./logger";
import { ContextAwareLogger, requestStore } from "./request-context";
import { extractTraceContext } from "./context";
import { OTelTracer } from "./tracer";
import { NoopTracer } from "./noop";
import { LOGGER_TOKEN, TRACER_TOKEN } from "./tokens";

const debugLog = createDebug("celerity:telemetry");

function isHttpContext(context: BaseHandlerContext): context is HttpHandlerContext {
  return "request" in context && typeof (context as HttpHandlerContext).request === "object";
}

const LOG_LEVEL_CONFIG_KEYS = [
  "CELERITY_LOG_LEVEL",
  "celerityLogLevel",
  "celerity_log_level",
  "CelerityLogLevel",
];

const VALID_LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

type ConfigService = {
  get(key: string): Promise<string | undefined>;
};

export class TelemetryLayer implements CelerityLayer<BaseHandlerContext> {
  private config: TelemetryConfig;
  private rootLogger: CelerityLoggerImpl | null = null;
  private currentLevel: LogLevel;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.config = readTelemetryEnv();
    this.currentLevel = this.config.logLevel;

    if (this.config.tracingEnabled) {
      this.initPromise = initTelemetry();
    }
  }

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }

    if (!this.rootLogger) {
      debugLog(
        "creating root logger (format=%s, level=%s)",
        this.config.logFormat,
        this.config.logLevel,
      );
      this.rootLogger = await createLogger(this.config);
      context.container.register(LOGGER_TOKEN, {
        useValue: new ContextAwareLogger(this.rootLogger),
      });
      context.container.register(TRACER_TOKEN, {
        useValue: this.config.tracingEnabled ? new OTelTracer() : new NoopTracer(),
      });
      debugLog("registered logger and tracer (tracing=%s)", this.config.tracingEnabled);
    }

    await this.refreshLogLevelFromConfig(context.container);

    const handlerName = context.metadata.get("handlerName") as string | undefined;
    let requestLogger;
    let traceRequest: HttpRequest | undefined;

    if (isHttpContext(context)) {
      const userId = extractUserId(context.request.auth);
      requestLogger = this.rootLogger.child("request", {
        ...(handlerName ? { handlerName } : {}),
        requestId: context.request.requestId,
        method: context.request.method,
        path: context.request.path,
        matchedRoute: context.request.matchedRoute,
        clientIp: context.request.clientIp,
        userAgent: context.request.userAgent,
        ...(userId ? { userId } : {}),
      });
      traceRequest = context.request;
    } else {
      requestLogger = this.rootLogger.child("request", {
        ...(handlerName ? { handlerName } : {}),
      });
    }

    context.logger = requestLogger;

    const runWithLogger = () => requestStore.run({ logger: requestLogger }, () => next());

    if (!this.config.tracingEnabled) return runWithLogger();

    if (traceRequest) {
      const parentContext = extractTraceContext(traceRequest);
      return otelContext.with(parentContext, runWithLogger);
    }

    return runWithLogger();
  }

  async dispose(): Promise<void> {
    if (this.config.tracingEnabled) await shutdownTelemetry();
  }

  private async refreshLogLevelFromConfig(container: ServiceContainer): Promise<void> {
    if (!container.has("ConfigService")) return;

    try {
      const configService = await container.resolve<ConfigService>("ConfigService");
      for (const key of LOG_LEVEL_CONFIG_KEYS) {
        const value = await configService.get(key);
        if (value && VALID_LOG_LEVELS.has(value) && value !== this.currentLevel) {
          debugLog("log level changed %s → %s", this.currentLevel, value);
          this.rootLogger?.setLevel(value as LogLevel);
          this.currentLevel = value as LogLevel;
          return;
        }
      }
    } catch {
      // Config resolution failed — keep current level
    }
  }
}
