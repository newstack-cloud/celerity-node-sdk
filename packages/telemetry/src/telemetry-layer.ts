import createDebug from "debug";
import { context as otelContext, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import type {
  CelerityLayer,
  BaseHandlerContext,
  HttpHandlerContext,
  ConsumerHandlerContext,
  LogLevel,
  ServiceContainer,
} from "@celerity-sdk/types";
import { extractUserId } from "@celerity-sdk/common";
import { readTelemetryEnv, type TelemetryConfig } from "./env";
import { initTelemetry, shutdownTelemetry } from "./init";
import { CelerityLoggerImpl, createLogger } from "./logger";
import { ContextAwareLogger, requestStore } from "./request-context";
import { OTelTracer } from "./tracer";
import { NoopTracer } from "./noop";
import { LOGGER_TOKEN, TRACER_TOKEN } from "./tokens";

const debugLog = createDebug("celerity:telemetry");

function isHttpContext(context: BaseHandlerContext): context is HttpHandlerContext {
  return "request" in context && typeof (context as HttpHandlerContext).request === "object";
}

function isConsumerContext(context: BaseHandlerContext): context is ConsumerHandlerContext {
  return "event" in context && typeof (context as ConsumerHandlerContext).event === "object";
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
    let handlerLogger;
    let traceCarrier: Record<string, string> | undefined;

    if (isHttpContext(context)) {
      const userId = extractUserId(context.request.auth);
      handlerLogger = this.rootLogger.child("request", {
        ...(handlerName ? { handlerName } : {}),
        requestId: context.request.requestId,
        method: context.request.method,
        path: context.request.path,
        matchedRoute: context.request.matchedRoute,
        clientIp: context.request.clientIp,
        userAgent: context.request.userAgent,
        ...(userId ? { userId } : {}),
      });
      traceCarrier = context.request.traceContext ?? undefined;
    } else if (isConsumerContext(context)) {
      const { messages } = context.event;
      const first = messages[0];
      const sourceMessageId = first?.messageAttributes?.sourceMessageId?.stringValue;
      handlerLogger = this.rootLogger.child("consumer", {
        ...(handlerName ? { handlerName } : {}),
        source: first?.source,
        messageCount: messages.length,
        ...(sourceMessageId ? { sourceMessageId } : {}),
      });
      traceCarrier = context.event.traceContext ?? undefined;
    } else {
      handlerLogger = this.rootLogger.child("handler", {
        ...(handlerName ? { handlerName } : {}),
      });
    }

    context.logger = handlerLogger;

    const runWithLogger = () => requestStore.run({ logger: handlerLogger }, () => next());

    if (!this.config.tracingEnabled) return runWithLogger();

    if (traceCarrier) {
      const parentContext = propagation.extract(ROOT_CONTEXT, traceCarrier);
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
