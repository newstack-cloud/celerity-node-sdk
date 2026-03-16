import "reflect-metadata";
import createDebug from "debug";
import type {
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";
import {
  CONSUMER_METADATA,
  CONSUMER_HANDLER_METADATA,
  PARAM_METADATA,
  LAYER_METADATA,
  CUSTOM_METADATA,
} from "../../metadata/constants";
import type { ConsumerHandlerMetadata } from "../../decorators/consumer";
import type { ParamMetadata } from "../../decorators/params";
import { validate } from "../../layers/validate";
import type { Container } from "../../di/container";
import type { ModuleGraph } from "../../bootstrap/module-graph";
import type { HandlerRegistry } from "../registry";

const debug = createDebug("celerity:core:scanner:consumer");

/**
 * Scans the module graph for Consumer class handlers and function handlers,
 * registering them in the handler registry.
 */
export async function scanConsumerHandlers(
  graph: ModuleGraph,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  for (const [, node] of graph) {
    for (const controllerClass of node.controllers) {
      await scanClassHandler(controllerClass, container, registry);
    }
    for (const fnHandler of node.functionHandlers) {
      scanFunctionHandler(fnHandler, registry);
    }
  }
}

async function scanClassHandler(
  controllerClass: Type,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  const consumerMeta = Reflect.getOwnMetadata(CONSUMER_METADATA, controllerClass);
  if (!consumerMeta) return;

  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");

  const classLayers: (CelerityLayer | Type<CelerityLayer>)[] =
    Reflect.getOwnMetadata(LAYER_METADATA, controllerClass) ?? [];
  const classCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {};

  for (const methodName of methods) {
    const handlerMeta: ConsumerHandlerMetadata | undefined = Reflect.getOwnMetadata(
      CONSUMER_HANDLER_METADATA,
      prototype,
      methodName,
    );
    if (!handlerMeta) continue;

    const methodLayers: (CelerityLayer | Type<CelerityLayer>)[] =
      Reflect.getOwnMetadata(LAYER_METADATA, prototype, methodName) ?? [];
    const paramMetadata: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, prototype, methodName) ?? [];
    const methodCustomMetadata: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor?.value || typeof descriptor.value !== "function") continue;

    // The handler tag is used for SDK-internal registry lookup — it must match
    // the key the orchestrator constructs: `${consumerName}::${methodName}`.
    // handlerMeta.route is for the Rust runtime's MessageHandlerWithRouter
    // routing logic, not for the SDK registry.
    const handlerTag = consumerMeta.source ? `${consumerMeta.source}::${methodName}` : methodName;

    const layers = [...classLayers, ...methodLayers];
    const messageParam = paramMetadata.find((p) => p.type === "messages");
    if (messageParam?.schema) {
      layers.unshift(validate({ consumerMessage: messageParam.schema }));
    }

    debug("scanClassHandler: tag=%s (%s.%s)", handlerTag, controllerClass.name, methodName);
    registry.register({
      type: "consumer",
      handlerTag,
      layers,
      paramMetadata,
      customMetadata: { ...classCustomMetadata, ...methodCustomMetadata },
      handlerFn: descriptor.value as (...args: unknown[]) => unknown,
      controllerClass,
    });
  }
}

function scanFunctionHandler(
  definition: FunctionHandlerDefinition,
  registry: HandlerRegistry,
): void {
  if (definition.type !== "consumer") return;

  const meta = definition.metadata as {
    route?: string;
    messageSchema?: Schema;
    layers?: (CelerityLayer | Type<CelerityLayer>)[];
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  // Same as class handlers — route is for Rust runtime routing, not SDK lookup.
  const handlerTag = definition.id ?? "default";

  const layers = [...(meta.layers ?? [])];
  if (meta.messageSchema) {
    layers.unshift(validate({ consumerMessage: meta.messageSchema }));
  }

  debug("scanFunctionHandler: tag=%s", handlerTag);
  registry.register({
    type: "consumer",
    id: definition.id,
    handlerTag,
    layers,
    paramMetadata: [],
    customMetadata: meta.customMetadata ?? {},
    handlerFn: definition.handler,
    isFunctionHandler: true,
    injectTokens: meta.inject ?? [],
  });
}
