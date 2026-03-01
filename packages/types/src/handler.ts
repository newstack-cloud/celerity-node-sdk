import type { ServiceContainer } from "./container";
import type { HandlerMetadata } from "./http";
import type { CelerityLogger } from "./telemetry";

export type HandlerType = "http" | "websocket" | "consumer" | "schedule" | "custom";

/** Shared fields present in every handler context. */
export type BaseHandlerContext = {
  metadata: HandlerMetadata;
  container: ServiceContainer;
  /** Request-scoped logger set by TelemetryLayer. */
  logger?: CelerityLogger;
};
