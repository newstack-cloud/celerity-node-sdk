import type {
  WebSocketMessage,
  WebSocketHandlerContext,
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";

export type WebSocketHandlerConfig = {
  route?: string;
  protectedBy?: string[];
  schema?: Schema;
  inject?: InjectionToken[];
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  metadata?: Record<string, unknown>;
};

type WebSocketHandlerFn = (
  message: WebSocketMessage,
  ctx: WebSocketHandlerContext,
  ...deps: unknown[]
) => Promise<void> | void;

export function createWebSocketHandler(
  config: WebSocketHandlerConfig,
  handler: WebSocketHandlerFn,
): FunctionHandlerDefinition {
  const metadata: Record<string, unknown> = {
    layers: config.layers ?? [],
    inject: config.inject ?? [],
    customMetadata: config.metadata ?? {},
  };

  if (config.route !== undefined) metadata.route = config.route;
  if (config.protectedBy !== undefined) metadata.protectedBy = config.protectedBy;
  if (config.schema !== undefined) metadata.schema = config.schema;

  return {
    __celerity_handler: true,
    type: "websocket",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}
