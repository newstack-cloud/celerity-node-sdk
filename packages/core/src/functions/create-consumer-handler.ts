import type {
  ConsumerEventInput,
  ConsumerHandlerContext,
  EventResult,
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";

export type ConsumerHandlerConfig = {
  route?: string;
  messageSchema?: Schema;
  inject?: InjectionToken[];
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  metadata?: Record<string, unknown>;
};

type ConsumerHandlerFn = (
  event: ConsumerEventInput,
  ctx: ConsumerHandlerContext,
  ...deps: unknown[]
) => Promise<EventResult>;

export function createConsumerHandler(
  config: ConsumerHandlerConfig,
  handler: ConsumerHandlerFn,
): FunctionHandlerDefinition {
  const metadata: Record<string, unknown> = {
    layers: config.layers ?? [],
    inject: config.inject ?? [],
    customMetadata: config.metadata ?? {},
  };

  if (config.route !== undefined) metadata.route = config.route;
  if (config.messageSchema !== undefined) metadata.messageSchema = config.messageSchema;

  return {
    __celerity_handler: true,
    type: "consumer",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}
