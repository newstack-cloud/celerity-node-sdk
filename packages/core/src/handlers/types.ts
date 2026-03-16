import type {
  HttpMethod,
  HandlerType,
  BaseHandlerContext,
  CelerityLayer,
  ServiceContainer,
  Type,
  InjectionToken,
} from "@celerity-sdk/types";
import type { ParamMetadata } from "../decorators/params";

export type { HandlerType };

export type ResolvedHandlerBase = {
  id?: string;
  handlerFn: (...args: unknown[]) => unknown;
  handlerInstance?: object;
  /** The class to lazily resolve via container on first invocation. */
  controllerClass?: Type;
  isFunctionHandler?: boolean;
  injectTokens?: InjectionToken[];
  layers: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  paramMetadata: ParamMetadata[];
  customMetadata: Record<string, unknown>;
};

/**
 * Lazily resolves the handler instance from the DI container on first call.
 * Resource tokens (datastore, cache, etc.) are registered by system layers
 * which run before the handler in the pipeline, so by the time this is called
 * during an actual request the tokens are available.
 */
export async function resolveHandlerInstance(
  handler: ResolvedHandlerBase,
  container: ServiceContainer,
): Promise<object> {
  if (handler.handlerInstance) return handler.handlerInstance;
  if (!handler.controllerClass) {
    throw new Error("Handler has no controllerClass for deferred resolution");
  }
  const instance = await container.resolve<object>(handler.controllerClass);
  handler.handlerInstance = instance;
  return instance;
}

export async function resolveGuardInstance(
  guard: ResolvedGuard,
  container: ServiceContainer,
): Promise<object> {
  if (guard.handlerInstance) return guard.handlerInstance;
  if (!guard.guardClass) {
    throw new Error("Guard has no guardClass for deferred resolution");
  }
  const instance = await container.resolve<object>(guard.guardClass);
  guard.handlerInstance = instance;
  return instance;
}

// Guards (protectedBy/isPublic) are only meaningful for HTTP and WebSocket handlers.
// HTTP guards execute at the Rust runtime (containers) or API Gateway (serverless).
// WebSocket guards execute on connect or on a specific authentication message.
// Consumer, schedule, and custom handlers have no guard enforcement mechanism.
type GuardableFields = {
  protectedBy: string[];
  isPublic: boolean;
};

export type ResolvedHttpHandler = ResolvedHandlerBase &
  GuardableFields & {
    type: "http";
    path?: string;
    method?: HttpMethod;
  };

export type ResolvedWebSocketHandler = ResolvedHandlerBase &
  GuardableFields & {
    type: "websocket";
    route: string;
  };

export type ResolvedConsumerHandler = ResolvedHandlerBase & {
  type: "consumer";
  handlerTag: string;
};

export type ResolvedScheduleHandler = ResolvedHandlerBase & {
  type: "schedule";
  handlerTag: string;
};

export type ResolvedCustomHandler = ResolvedHandlerBase & {
  type: "custom";
  name: string;
};

export type ResolvedHandler =
  | ResolvedHttpHandler
  | ResolvedWebSocketHandler
  | ResolvedConsumerHandler
  | ResolvedScheduleHandler
  | ResolvedCustomHandler;

export type ResolvedGuard = {
  name: string;
  handlerFn: (...args: unknown[]) => unknown;
  handlerInstance?: object;
  /** The guard class to lazily resolve via container on first invocation. */
  guardClass?: Type;
  paramMetadata: ParamMetadata[];
  customMetadata: Record<string, unknown>;
  injectTokens?: InjectionToken[];
  isFunctionGuard?: boolean;
};
