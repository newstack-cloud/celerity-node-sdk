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
  INVOKE_METADATA,
  PARAM_METADATA,
  LAYER_METADATA,
  CUSTOM_METADATA,
} from "../../metadata/constants";
import type { InvokeMetadata } from "../../decorators/invoke";
import type { ParamMetadata } from "../../decorators/params";
import { validate } from "../../layers/validate";
import type { Container } from "../../di/container";
import type { ModuleGraph } from "../../bootstrap/module-graph";
import type { HandlerRegistry } from "../registry";

const debug = createDebug("celerity:core:scanner:custom");

/**
 * Scans the module graph for custom/invocable handlers — a cross-cutting scan
 * that walks ALL controllers (any class in `controllers`) looking for methods
 * decorated with `@Invoke()`. Also scans function handlers with
 * `type: "custom"`.
 */
export async function scanCustomHandlers(
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
  // Cross-cutting: no class-level metadata check — scan ALL controllers
  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");

  const classLayers: (CelerityLayer | Type<CelerityLayer>)[] =
    Reflect.getOwnMetadata(LAYER_METADATA, controllerClass) ?? [];
  const classCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {};

  for (const methodName of methods) {
    const invokeMeta: InvokeMetadata | undefined = Reflect.getOwnMetadata(
      INVOKE_METADATA,
      prototype,
      methodName,
    );
    if (!invokeMeta) continue;

    const methodLayers: (CelerityLayer | Type<CelerityLayer>)[] =
      Reflect.getOwnMetadata(LAYER_METADATA, prototype, methodName) ?? [];
    const paramMetadata: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, prototype, methodName) ?? [];
    const methodCustomMetadata: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor?.value || typeof descriptor.value !== "function") continue;

    const layers = [...classLayers, ...methodLayers];
    const payloadParam = paramMetadata.find((p) => p.type === "payload");
    if (payloadParam?.schema) {
      layers.unshift(validate({ customPayload: payloadParam.schema }));
    }

    debug("scanClassHandler: name=%s (%s.%s)", invokeMeta.name, controllerClass.name, methodName);
    registry.register({
      type: "custom",
      name: invokeMeta.name,
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
  if (definition.type !== "custom") return;

  const meta = definition.metadata as {
    name?: string;
    schema?: Schema;
    layers?: (CelerityLayer | Type<CelerityLayer>)[];
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  const name = meta.name ?? definition.id ?? "default";

  const layers = [...(meta.layers ?? [])];
  if (meta.schema) {
    layers.unshift(validate({ customPayload: meta.schema }));
  }

  debug("scanFunctionHandler: name=%s", name);
  registry.register({
    type: "custom",
    id: definition.id,
    name,
    layers,
    paramMetadata: [],
    customMetadata: meta.customMetadata ?? {},
    handlerFn: definition.handler,
    isFunctionHandler: true,
    injectTokens: meta.inject ?? [],
  });
}
