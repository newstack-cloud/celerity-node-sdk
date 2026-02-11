import { AsyncLocalStorage } from "node:async_hooks";
import type { CelerityLogger } from "@celerity-sdk/types";

type RequestStore = {
  logger: CelerityLogger;
};

export const requestStore = new AsyncLocalStorage<RequestStore>();

/**
 * Get the request-scoped logger from the current async context.
 *
 * Works anywhere in the async call chain during request handling —
 * handlers, services, repositories, API clients.
 *
 * Returns `undefined` outside a request context (e.g., startup code, background tasks).
 */
export function getRequestLogger(): CelerityLogger | undefined {
  return requestStore.getStore()?.logger;
}

/**
 * Context-aware logger proxy registered under LOGGER_TOKEN.
 *
 * Delegates to the request-scoped logger (via AsyncLocalStorage) when inside
 * a request context, falls back to the root logger otherwise.
 *
 * This means `@Inject(LOGGER_TOKEN)` automatically resolves to the most
 * appropriate logger for the current context — no manual wiring needed.
 */
export class ContextAwareLogger implements CelerityLogger {
  constructor(private rootLogger: CelerityLogger) {}

  private get current(): CelerityLogger {
    return getRequestLogger() ?? this.rootLogger;
  }

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.current.debug(message, attributes);
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.current.info(message, attributes);
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.current.warn(message, attributes);
  }

  error(message: string, attributes?: Record<string, unknown>): void {
    this.current.error(message, attributes);
  }

  child(name: string, attributes?: Record<string, unknown>): CelerityLogger {
    return this.current.child(name, attributes);
  }

  withContext(attributes: Record<string, unknown>): CelerityLogger {
    return this.current.withContext(attributes);
  }
}
