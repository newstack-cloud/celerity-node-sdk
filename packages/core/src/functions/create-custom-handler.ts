import type {
  BaseHandlerContext,
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";

export type CustomHandlerConfig<TInput = unknown> = {
  name?: string;
  schema?: Schema<TInput>;
  inject?: InjectionToken[];
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  metadata?: Record<string, unknown>;
};

type CustomHandlerFn = (
  payload: unknown,
  ctx: BaseHandlerContext,
  ...deps: unknown[]
) => Promise<unknown>;

/**
 * Creates a function-based custom/invocable handler definition.
 *
 * Function handlers are blueprint-first — the handler name and invocation
 * binding come from the blueprint. The handler declares its dependencies,
 * an optional schema for type-safe payload validation, and the implementation.
 *
 * @example
 * ```ts
 * // With schema — payload is validated and typed before the handler runs
 * const processPayment = createCustomHandler(
 *   { schema: PaymentSchema, inject: [PaymentService] },
 *   async (payload, ctx, paymentService: PaymentService) => {
 *     return paymentService.process(payload as PaymentInput);
 *   },
 * );
 *
 * // Without schema — payload is unknown
 * const healthCheck = createCustomHandler(
 *   {},
 *   async () => ({ status: "ok" }),
 * );
 * ```
 */
export function createCustomHandler(
  config: CustomHandlerConfig,
  handler: CustomHandlerFn,
): FunctionHandlerDefinition {
  const metadata: Record<string, unknown> = {
    layers: config.layers ?? [],
    inject: config.inject ?? [],
    customMetadata: config.metadata ?? {},
  };

  if (config.name !== undefined) metadata.name = config.name;
  if (config.schema !== undefined) metadata.schema = config.schema;

  return {
    __celerity_handler: true,
    type: "custom",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}
