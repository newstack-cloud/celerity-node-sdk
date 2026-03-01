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
  SCHEDULE_HANDLER_METADATA,
  PARAM_METADATA,
  LAYER_METADATA,
  CUSTOM_METADATA,
} from "../../metadata/constants";
import type { ScheduleHandlerMetadata } from "../../decorators/schedule";
import type { ParamMetadata } from "../../decorators/params";
import { validate } from "../../layers/validate";
import type { Container } from "../../di/container";
import type { ModuleGraph } from "../../bootstrap/module-graph";
import type { HandlerRegistry } from "../registry";

const debug = createDebug("celerity:core:scanner:schedule");

/**
 * Scans the module graph for schedule handlers — a cross-cutting scan that
 * walks ALL controllers (any class in `controllers`) looking for methods
 * decorated with `@ScheduleHandler()`. Also scans function handlers with
 * `type: "schedule"`.
 */
export async function scanScheduleHandlers(
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
  const instance = await container.resolve<object>(controllerClass);
  const prototype = Object.getPrototypeOf(instance) as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");

  const classLayers: (CelerityLayer | Type<CelerityLayer>)[] =
    Reflect.getOwnMetadata(LAYER_METADATA, controllerClass) ?? [];
  const classCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {};

  for (const methodName of methods) {
    const handlerMeta: ScheduleHandlerMetadata | undefined = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
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

    const handlerTag = handlerMeta.scheduleId ?? methodName;

    const layers = [...classLayers, ...methodLayers];
    const inputParam = paramMetadata.find((p) => p.type === "scheduleInput");
    if (inputParam?.schema) {
      layers.unshift(validate({ scheduleInput: inputParam.schema }));
    }

    debug("scanClassHandler: tag=%s (%s.%s)", handlerTag, controllerClass.name, methodName);
    registry.register({
      type: "schedule",
      handlerTag,
      layers,
      paramMetadata,
      customMetadata: {
        ...classCustomMetadata,
        ...methodCustomMetadata,
        ...(handlerMeta.schedule ? { schedule: handlerMeta.schedule } : {}),
        ...(handlerMeta.scheduleId ? { scheduleId: handlerMeta.scheduleId } : {}),
      },
      handlerFn: descriptor.value as (...args: unknown[]) => unknown,
      handlerInstance: instance,
    });
  }
}

function scanFunctionHandler(
  definition: FunctionHandlerDefinition,
  registry: HandlerRegistry,
): void {
  if (definition.type !== "schedule") return;

  const meta = definition.metadata as {
    scheduleId?: string;
    schedule?: string;
    schema?: Schema;
    layers?: (CelerityLayer | Type<CelerityLayer>)[];
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  const handlerTag = meta.scheduleId ?? definition.id ?? "default";

  const layers = [...(meta.layers ?? [])];
  if (meta.schema) {
    layers.unshift(validate({ scheduleInput: meta.schema }));
  }

  const customMetadata: Record<string, unknown> = { ...(meta.customMetadata ?? {}) };
  if (meta.schedule) customMetadata.schedule = meta.schedule;
  if (meta.scheduleId) customMetadata.scheduleId = meta.scheduleId;

  debug("scanFunctionHandler: tag=%s", handlerTag);
  registry.register({
    type: "schedule",
    id: definition.id,
    handlerTag,
    layers,
    paramMetadata: [],
    customMetadata,
    handlerFn: definition.handler,
    isFunctionHandler: true,
    injectTokens: meta.inject ?? [],
  });
}
