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
  WEBSOCKET_CONTROLLER_METADATA,
  WEBSOCKET_EVENT_METADATA,
  PARAM_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  LAYER_METADATA,
  PUBLIC_METADATA,
  CUSTOM_METADATA,
} from "../../metadata/constants";
import type { WebSocketEventMetadata } from "../../decorators/websocket";
import type { ParamMetadata } from "../../decorators/params";
import { validate } from "../../layers/validate";
import type { Container } from "../../di/container";
import type { ModuleGraph } from "../../bootstrap/module-graph";
import type { HandlerRegistry } from "../registry";

const debug = createDebug("celerity:core:scanner:websocket");

/**
 * Scans the module graph for WebSocket class handlers and function handlers,
 * registering them in the handler registry.
 */
export async function scanWebSocketHandlers(
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
  const isWsController: boolean | undefined = Reflect.getOwnMetadata(
    WEBSOCKET_CONTROLLER_METADATA,
    controllerClass,
  );
  if (!isWsController) return;

  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");

  const classProtectedBy: string[] =
    Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, controllerClass) ?? [];
  const classLayers: (CelerityLayer | Type<CelerityLayer>)[] =
    Reflect.getOwnMetadata(LAYER_METADATA, controllerClass) ?? [];
  const classCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {};
  const classIsPublic: boolean = Reflect.getOwnMetadata(PUBLIC_METADATA, controllerClass) === true;

  for (const methodName of methods) {
    const eventMeta: WebSocketEventMetadata | undefined = Reflect.getOwnMetadata(
      WEBSOCKET_EVENT_METADATA,
      prototype,
      methodName,
    );
    if (!eventMeta) continue;

    const methodLayers: (CelerityLayer | Type<CelerityLayer>)[] =
      Reflect.getOwnMetadata(LAYER_METADATA, prototype, methodName) ?? [];
    const paramMetadata: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, prototype, methodName) ?? [];
    const methodCustomMetadata: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor?.value || typeof descriptor.value !== "function") continue;

    debug(
      "scanClassHandler: %s %s (%s.%s)",
      eventMeta.eventType,
      eventMeta.route,
      controllerClass.name,
      methodName,
    );
    const layers = [...classLayers, ...methodLayers];
    const msgBodyParam = paramMetadata.find((p) => p.type === "messageBody");
    if (msgBodyParam?.schema) {
      layers.unshift(validate({ wsMessageBody: msgBodyParam.schema }));
    }

    registry.register({
      type: "websocket",
      route: eventMeta.route,
      protectedBy: classProtectedBy,
      layers,
      isPublic: classIsPublic,
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
  if (definition.type !== "websocket") return;

  const meta = definition.metadata as {
    route?: string;
    protectedBy?: string[];
    schema?: Schema;
    layers?: (CelerityLayer | Type<CelerityLayer>)[];
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  const layers = [...(meta.layers ?? [])];
  if (meta.schema) {
    layers.unshift(validate({ wsMessageBody: meta.schema }));
  }

  debug("scanFunctionHandler: %s", definition.id ?? meta.route ?? "(no route)");
  registry.register({
    type: "websocket",
    id: definition.id,
    route: meta.route ?? "$default",
    protectedBy: meta.protectedBy ?? [],
    layers,
    isPublic: false,
    paramMetadata: [],
    customMetadata: meta.customMetadata ?? {},
    handlerFn: definition.handler,
    isFunctionHandler: true,
    injectTokens: meta.inject ?? [],
  });
}
