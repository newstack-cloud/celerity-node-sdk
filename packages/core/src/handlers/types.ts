import type {
  HttpMethod,
  HandlerType,
  BaseHandlerContext,
  CelerityLayer,
  Type,
  InjectionToken,
} from "@celerity-sdk/types";
import type { ParamMetadata } from "../decorators/params";

export type { HandlerType };

export type ResolvedHandlerBase = {
  id?: string;
  handlerFn: (...args: unknown[]) => unknown;
  handlerInstance?: object;
  isFunctionHandler?: boolean;
  injectTokens?: InjectionToken[];
  layers: (CelerityLayer<BaseHandlerContext> | Type<CelerityLayer<BaseHandlerContext>>)[];
  paramMetadata: ParamMetadata[];
  customMetadata: Record<string, unknown>;
};

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
  paramMetadata: ParamMetadata[];
  customMetadata: Record<string, unknown>;
  injectTokens?: InjectionToken[];
  isFunctionGuard?: boolean;
};
