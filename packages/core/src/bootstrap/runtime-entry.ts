import { resolve, dirname } from "node:path";
import createDebug from "debug";
import type { Request as RuntimeRequest, Response as RuntimeResponse } from "@celerity-sdk/runtime";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { executeHttpPipeline } from "../handlers/http-pipeline";
import { executeWebSocketPipeline } from "../handlers/websocket-pipeline";
import { executeConsumerPipeline } from "../handlers/consumer-pipeline";
import { executeSchedulePipeline } from "../handlers/schedule-pipeline";
import { executeCustomPipeline } from "../handlers/custom-pipeline";
import {
  executeGuardPipeline,
  type GuardInput,
  type GuardResult,
} from "../handlers/guard-pipeline";
import { resolveHandlerByModuleRef } from "../handlers/module-resolver";
import { discoverModule } from "./discovery";
import { bootstrap } from "./bootstrap";
import type {
  JsWebSocketMessageInfo,
  JsConsumerEventInput,
  JsScheduleEventInput,
  JsEventResult,
} from "@celerity-sdk/runtime";
import {
  mapRuntimeRequest,
  mapToRuntimeResponse,
  mapWebSocketMessage,
  mapConsumerEventInput,
  mapScheduleEventInput,
  mapToNapiEventResult,
} from "./runtime-mapper";
import { createDefaultSystemLayers } from "../layers/system";

const debug = createDebug("celerity:core:runtime-entry");

type RuntimeCallback = (err: Error | null, request: RuntimeRequest) => Promise<RuntimeResponse>;
type WebSocketCallback = (err: Error | null, info: JsWebSocketMessageInfo) => Promise<void>;
type ConsumerCallback = (err: Error | null, input: JsConsumerEventInput) => Promise<JsEventResult>;
type ScheduleCallback = (err: Error | null, input: JsScheduleEventInput) => Promise<JsEventResult>;
type CustomCallback = (err: Error | null, payload: unknown) => Promise<unknown>;
type GuardCallback = (input: GuardInput) => Promise<GuardResult>;

export type RuntimeBootstrapResult = {
  registry: HandlerRegistry;
  container: Container;

  // HTTP
  createRouteCallback(method: string, path: string, handlerName?: string): RuntimeCallback | null;
  createRouteCallbackById(
    handlerId: string,
    codeLocation?: string,
    handlerName?: string,
  ): Promise<RuntimeCallback | null>;

  // Guards
  createGuardCallback(guardName: string): GuardCallback | null;

  // WebSocket
  createWebSocketCallback(route: string, handlerName?: string): WebSocketCallback | null;
  createWebSocketCallbackById(
    handlerId: string,
    codeLocation?: string,
    handlerName?: string,
  ): Promise<WebSocketCallback | null>;

  // Consumer
  createConsumerCallback(handlerTag: string, handlerName?: string): ConsumerCallback | null;
  createConsumerCallbackById(
    handlerId: string,
    codeLocation?: string,
    handlerName?: string,
  ): Promise<ConsumerCallback | null>;

  // Schedule
  createScheduleCallback(handlerTag: string, handlerName?: string): ScheduleCallback | null;
  createScheduleCallbackById(
    handlerId: string,
    codeLocation?: string,
    handlerName?: string,
  ): Promise<ScheduleCallback | null>;

  // Custom
  createCustomCallback(handlerName: string): CustomCallback | null;
  createCustomCallbackById(
    handlerId: string,
    codeLocation?: string,
    handlerName?: string,
  ): Promise<CustomCallback | null>;
};

/**
 * Bootstrap the user's module and return an object with per-route callback creation.
 * Used by the runtime host to get handler callbacks for each blueprint route.
 */
export async function bootstrapForRuntime(
  modulePath?: string,
  systemLayers?: (CelerityLayer | Type<CelerityLayer>)[],
): Promise<RuntimeBootstrapResult> {
  // Resolve system layers first — triggers OTel SDK init before user module loads.
  const layers = systemLayers ?? (await createDefaultSystemLayers());

  const resolvedModulePath = modulePath ?? process.env.CELERITY_MODULE_PATH;
  const moduleDir = resolvedModulePath ? dirname(resolve(resolvedModulePath)) : process.cwd();

  const rootModule = await discoverModule(modulePath);
  const { container, registry } = await bootstrap(rootModule);

  function buildHttpCallback(
    handler: ReturnType<HandlerRegistry["getHandlersByType"]>[number] | undefined,
    handlerName?: string,
  ): RuntimeCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, request: RuntimeRequest): Promise<RuntimeResponse> => {
      const httpRequest = mapRuntimeRequest(request);
      const httpResponse = await executeHttpPipeline(handler, httpRequest, {
        container,
        systemLayers: layers,
        handlerName,
      });
      return mapToRuntimeResponse(httpResponse);
    };
  }

  function buildWebSocketCallback(
    handler: ReturnType<HandlerRegistry["getHandlersByType"]>[number] | undefined,
    handlerName?: string,
  ): WebSocketCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, info: JsWebSocketMessageInfo): Promise<void> => {
      const message = mapWebSocketMessage(info);
      await executeWebSocketPipeline(handler, message, {
        container,
        systemLayers: layers,
        handlerName,
      });
    };
  }

  function buildConsumerCallback(
    handler: ReturnType<HandlerRegistry["getHandlersByType"]>[number] | undefined,
    handlerName?: string,
  ): ConsumerCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, input: JsConsumerEventInput): Promise<JsEventResult> => {
      const event = mapConsumerEventInput(input);
      const result = await executeConsumerPipeline(handler, event, {
        container,
        systemLayers: layers,
        handlerName,
      });
      return mapToNapiEventResult(result);
    };
  }

  function buildScheduleCallback(
    handler: ReturnType<HandlerRegistry["getHandlersByType"]>[number] | undefined,
    handlerName?: string,
  ): ScheduleCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, input: JsScheduleEventInput): Promise<JsEventResult> => {
      const event = mapScheduleEventInput(input);
      const result = await executeSchedulePipeline(handler, event, {
        container,
        systemLayers: layers,
        handlerName,
      });
      return mapToNapiEventResult(result);
    };
  }

  function buildCustomCallback(
    handler: ReturnType<HandlerRegistry["getHandlersByType"]>[number] | undefined,
    handlerName?: string,
  ): CustomCallback | null {
    if (!handler) return null;

    return async (_err: Error | null, payload: unknown): Promise<unknown> => {
      return executeCustomPipeline(handler, payload, {
        container,
        systemLayers: layers,
        handlerName,
      });
    };
  }

  return {
    registry,
    container,
    createRouteCallback(method: string, path: string, handlerName?: string) {
      return buildHttpCallback(registry.getHandler("http", `${method} ${path}`), handlerName);
    },
    async createRouteCallbackById(handlerId: string, codeLocation?: string, handlerName?: string) {
      const fromRegistry = registry.getHandlerById("http", handlerId);
      if (fromRegistry) return buildHttpCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, "http", registry, baseDir);
      return resolved ? buildHttpCallback(resolved, handlerName) : null;
    },
    createGuardCallback(guardName: string): GuardCallback | null {
      const guard = registry.getGuard(guardName);
      if (!guard) return null;
      return async (input: GuardInput) => {
        debug("guard %s — input method=%s path=%s", guardName, input.method, input.path);
        const handler = registry.getHandler("http", `${input.method} ${input.path}`);
        debug(
          "guard %s — handler %s, customMetadata=%o",
          guardName,
          handler ? "found" : "not found",
          handler?.customMetadata,
        );
        return executeGuardPipeline(guard, input, {
          container,
          handlerMetadata: handler?.customMetadata,
        });
      };
    },
    createWebSocketCallback(route: string, handlerName?: string) {
      return buildWebSocketCallback(registry.getHandler("websocket", route), handlerName);
    },
    async createWebSocketCallbackById(
      handlerId: string,
      codeLocation?: string,
      handlerName?: string,
    ) {
      const fromRegistry = registry.getHandlerById("websocket", handlerId);
      if (fromRegistry) return buildWebSocketCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, "websocket", registry, baseDir);
      return resolved ? buildWebSocketCallback(resolved, handlerName) : null;
    },
    createConsumerCallback(handlerTag: string, handlerName?: string) {
      return buildConsumerCallback(registry.getHandler("consumer", handlerTag), handlerName);
    },
    async createConsumerCallbackById(
      handlerId: string,
      codeLocation?: string,
      handlerName?: string,
    ) {
      const fromRegistry = registry.getHandlerById("consumer", handlerId);
      if (fromRegistry) return buildConsumerCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, "consumer", registry, baseDir);
      return resolved ? buildConsumerCallback(resolved, handlerName) : null;
    },
    createScheduleCallback(handlerTag: string, handlerName?: string) {
      return buildScheduleCallback(registry.getHandler("schedule", handlerTag), handlerName);
    },
    async createScheduleCallbackById(
      handlerId: string,
      codeLocation?: string,
      handlerName?: string,
    ) {
      const fromRegistry = registry.getHandlerById("schedule", handlerId);
      if (fromRegistry) return buildScheduleCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, "schedule", registry, baseDir);
      return resolved ? buildScheduleCallback(resolved, handlerName) : null;
    },
    createCustomCallback(handlerName: string) {
      return buildCustomCallback(registry.getHandler("custom", handlerName), handlerName);
    },
    async createCustomCallbackById(handlerId: string, codeLocation?: string, handlerName?: string) {
      const fromRegistry = registry.getHandlerById("custom", handlerId);
      if (fromRegistry) return buildCustomCallback(fromRegistry, handlerName);

      const baseDir = codeLocation ? resolve(codeLocation) : moduleDir;
      const resolved = await resolveHandlerByModuleRef(handlerId, "custom", registry, baseDir);
      return resolved ? buildCustomCallback(resolved, handlerName) : null;
    },
  };
}
