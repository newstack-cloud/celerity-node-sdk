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
  /**
   * The blueprint consumer resource this handler belongs to.
   *
   * Needed whenever a consumer has more than one handler, a deploy target that
   * puts them all behind a single function has to find them as a set, and the
   * route alone says which of them takes a message, not which consumer they
   * belong to. A consumer with a single handler does not need it, the same as
   * for `@Consumer()`.
   */
  source?: string;
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

  if (config.source !== undefined) metadata.source = config.source;
  if (config.route !== undefined) metadata.route = config.route;
  if (config.messageSchema !== undefined) metadata.messageSchema = config.messageSchema;

  return {
    __celerity_handler: true,
    type: "consumer",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}
