import type { BaseHandlerContext } from "./handler";
import type { ServiceContainer } from "./container";
import type { CelerityLogger } from "./telemetry";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type HttpRequest = {
  method: HttpMethod;
  path: string;
  pathParams: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  cookies: Record<string, string>;
  textBody: string | null;
  binaryBody: Buffer | null;
  contentType: string | null;
  requestId: string;
  requestTime: string;
  auth: Record<string, unknown> | null;
  clientIp: string | null;
  traceContext: Record<string, string> | null;
  userAgent: string | null;
  matchedRoute: string | null;
};

export type HttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  binaryBody?: Buffer;
};

export interface HandlerMetadata {
  /** Read metadata by key. Request-scoped values shadow decorator values. */
  get<T = unknown>(key: string): T | undefined;
  /** Write a request-scoped value. Does not mutate decorator metadata. */
  set(key: string, value: unknown): void;
  /** Check if key exists (either scope). */
  has(key: string): boolean;
}

export type HttpHandlerContext = BaseHandlerContext & {
  request: HttpRequest;
};

/** Request data available to guard handlers from the runtime. */
export type GuardHandlerRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: unknown;
  requestId: string;
  clientIp: string;
};

/** Context passed to guard `check()` methods. */
export type GuardHandlerContext = {
  /** Auth token extracted by the runtime (using the configured token source and auth scheme). */
  token: string;
  /** Accumulated auth from preceding guards, keyed by guard name. */
  auth: Record<string, unknown>;
  /** Request data available from the runtime. */
  request: GuardHandlerRequest;
  /** Handler metadata from decorators (e.g. `@Action`). */
  metadata: HandlerMetadata;
  /** DI container for resolving services. */
  container: ServiceContainer;
  /** Request-scoped logger, when available. */
  logger?: CelerityLogger;
};
