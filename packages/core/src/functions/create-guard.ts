import type {
  GuardDefinition,
  HandlerMetadata,
  InjectionToken,
  ServiceContainer,
  CelerityLogger,
} from "@celerity-sdk/types";

export type GuardConfig = {
  name?: string;
  inject?: InjectionToken[];
  metadata?: Record<string, unknown>;
};

/**
 * The request context provided to a guard handler.
 * Mirrors the Rust runtime's `AuthGuardValidateInput` + `RequestInfo`.
 */
export type GuardRequest = {
  token: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: unknown;
  requestId: string;
  clientIp: string;
};

export type GuardContext = {
  metadata: HandlerMetadata;
  container: ServiceContainer;
  logger?: CelerityLogger;
  /**
   * Claims accumulated from preceding guards in the chain.
   * Keyed by guard name (e.g. `{ jwt: { sub: "user-1", ... } }`).
   * Empty object for the first guard in the chain.
   */
  auth: Record<string, unknown>;
};

/**
 * Guard handler function signature.
 * Return the claims object to attach to `request.auth.<guardName>`,
 * or throw `ForbiddenException`/`UnauthorizedException` to reject.
 */
export type GuardHandlerFn = (req: GuardRequest, ctx: GuardContext, ...deps: unknown[]) => unknown;

export function createGuard(config: GuardConfig, handler: GuardHandlerFn): GuardDefinition {
  return {
    __celerity_guard: true,
    name: config.name,
    handler: handler as (...args: unknown[]) => unknown,
    metadata: {
      inject: config.inject ?? [],
      customMetadata: config.metadata ?? {},
    },
  };
}
