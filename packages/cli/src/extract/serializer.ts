import "reflect-metadata";
import type {
  Type,
  HttpMethod,
  InjectionToken,
  GuardDefinition,
  FunctionHandlerDefinition,
} from "@celerity-sdk/types";
import {
  CONTROLLER_METADATA,
  HTTP_METHOD_METADATA,
  ROUTE_PATH_METADATA,
  WEBSOCKET_CONTROLLER_METADATA,
  WEBSOCKET_EVENT_METADATA,
  CONSUMER_METADATA,
  CONSUMER_HANDLER_METADATA,
  SCHEDULE_HANDLER_METADATA,
  INVOKE_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  GUARD_CUSTOM_METADATA,
  PUBLIC_METADATA,
  CUSTOM_METADATA,
  USE_RESOURCE_METADATA,
} from "@celerity-sdk/core";
import type {
  ControllerMetadata,
  WebSocketEventMetadata,
  ConsumerHandlerMetadata,
  ScheduleHandlerMetadata,
  InvokeMetadata,
  ConsumerMetadata,
} from "@celerity-sdk/core";
import type { ScannedModule } from "./metadata-app";
import type {
  HandlerManifest,
  ClassHandlerEntry,
  FunctionHandlerEntry,
  GuardHandlerEntry,
  DependencyGraph,
  DependencyNode,
} from "./types";
import { joinHandlerPath } from "./path-utils";
import {
  deriveClassResourceName,
  deriveClassHandlerName,
  deriveClassHandlerFunction,
  deriveCodeLocation,
  deriveFunctionResourceName,
  deriveFunctionHandlerFunction,
} from "./identity";

export type SerializeOptions = {
  projectRoot: string;
};

export function serializeManifest(
  scanned: ScannedModule,
  sourceFile: string,
  options: SerializeOptions,
): HandlerManifest {
  const handlers: ClassHandlerEntry[] = [];
  const functionHandlers: FunctionHandlerEntry[] = [];
  const guardHandlers: GuardHandlerEntry[] = [];

  for (const controllerClass of scanned.controllerClasses) {
    const entries = serializeClassHandlers(controllerClass, sourceFile, options);
    handlers.push(...entries);
  }

  for (const fnHandler of scanned.functionHandlers) {
    const entry = serializeFunctionHandler(fnHandler, sourceFile, options);
    if (entry) {
      functionHandlers.push(entry);
    }
  }

  for (const guardClass of scanned.guardClasses) {
    const entry = serializeClassGuard(guardClass, sourceFile, options);
    if (entry) {
      guardHandlers.push(entry);
    }
  }

  for (const fnGuard of scanned.functionGuards) {
    const entry = serializeFunctionGuard(fnGuard, sourceFile, options);
    if (entry) {
      guardHandlers.push(entry);
    }
  }

  return {
    version: "1.0.0",
    handlers,
    functionHandlers,
    guardHandlers,
    dependencyGraph: serializeDependencyGraph(scanned),
  };
}

// ---------------------------------------------------------------------------
// Controller meta extraction
// ---------------------------------------------------------------------------

type ControllerType = "http" | "websocket" | "consumer";

type ControllerMeta = {
  controllerType: ControllerType;
  prefix: string;
  sourceId?: string;
  protectedBy: string[];
  customGuardName: string | undefined;
  customMetadata: Record<string, unknown>;
  resourceRefs: string[];
};

function extractControllerMeta(controllerClass: Type): ControllerMeta | null {
  const httpMeta: ControllerMetadata | undefined = Reflect.getOwnMetadata(
    CONTROLLER_METADATA,
    controllerClass,
  );
  if (httpMeta) {
    return {
      controllerType: "http",
      prefix: httpMeta.prefix ?? "",
      ...extractSharedClassMeta(controllerClass),
    };
  }

  const isWebSocket: boolean | undefined = Reflect.getOwnMetadata(
    WEBSOCKET_CONTROLLER_METADATA,
    controllerClass,
  );
  if (isWebSocket) {
    return {
      controllerType: "websocket",
      prefix: "",
      ...extractSharedClassMeta(controllerClass),
    };
  }

  const consumerMeta: ConsumerMetadata | undefined = Reflect.getOwnMetadata(
    CONSUMER_METADATA,
    controllerClass,
  );
  if (consumerMeta) {
    return {
      controllerType: "consumer",
      prefix: "",
      sourceId: consumerMeta.sourceId,
      ...extractSharedClassMeta(controllerClass),
    };
  }

  return null;
}

function extractSharedClassMeta(controllerClass: Type) {
  return {
    protectedBy:
      (Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, controllerClass) as string[]) ?? [],
    customGuardName: Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, controllerClass) as
      | string
      | undefined,
    customMetadata:
      (Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) as Record<string, unknown>) ?? {},
    resourceRefs:
      (Reflect.getOwnMetadata(USE_RESOURCE_METADATA, controllerClass) as string[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Shared annotation helpers
// ---------------------------------------------------------------------------

function appendSharedAnnotations(
  annotations: Record<string, string | string[] | boolean>,
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
): void {
  const methodProtectedBy: string[] =
    Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, prototype, methodName) ?? [];
  const allProtectedBy = [...meta.protectedBy, ...methodProtectedBy];
  if (allProtectedBy.length > 0) {
    annotations["celerity.handler.guard.protectedBy"] = allProtectedBy;
  }
  if (meta.customGuardName) {
    annotations["celerity.handler.guard.custom"] = meta.customGuardName;
  }

  const isPublic: boolean = Reflect.getOwnMetadata(PUBLIC_METADATA, prototype, methodName) === true;
  if (isPublic) {
    annotations["celerity.handler.public"] = true;
  }

  const methodCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};
  const customMetadata = { ...meta.customMetadata, ...methodCustomMetadata };
  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  const methodResourceRefs: string[] =
    Reflect.getOwnMetadata(USE_RESOURCE_METADATA, prototype, methodName) ?? [];
  const allResourceRefs = [...new Set([...meta.resourceRefs, ...methodResourceRefs])];
  if (allResourceRefs.length > 0) {
    annotations["celerity.handler.resource.ref"] = allResourceRefs;
  }
}

// ---------------------------------------------------------------------------
// Type-specific annotation builders (class handlers)
// ---------------------------------------------------------------------------

function buildHttpAnnotations(
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
  httpMethod: HttpMethod,
  fullPath: string,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};
  annotations["celerity.handler.http"] = true;
  annotations["celerity.handler.http.method"] = httpMethod;
  annotations["celerity.handler.http.path"] = fullPath;
  appendSharedAnnotations(annotations, meta, prototype, methodName);
  return annotations;
}

function buildWebSocketAnnotations(
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
  wsEvent: WebSocketEventMetadata,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};
  annotations["celerity.handler.websocket"] = true;
  annotations["celerity.handler.websocket.route"] = wsEvent.route;
  annotations["celerity.handler.websocket.eventType"] = wsEvent.eventType;
  appendSharedAnnotations(annotations, meta, prototype, methodName);
  return annotations;
}

function buildConsumerAnnotations(
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
  consumerHandler: ConsumerHandlerMetadata,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};
  annotations["celerity.handler.consumer"] = true;
  if (meta.sourceId) {
    annotations["celerity.handler.consumer.sourceId"] = meta.sourceId;
  }
  if (consumerHandler.route) {
    annotations["celerity.handler.consumer.route"] = consumerHandler.route;
  }
  appendSharedAnnotations(annotations, meta, prototype, methodName);
  return annotations;
}

function buildScheduleAnnotations(
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
  scheduleMeta: ScheduleHandlerMetadata,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};
  annotations["celerity.handler.schedule"] = true;
  if (scheduleMeta.scheduleId) {
    annotations["celerity.handler.schedule.scheduleId"] = scheduleMeta.scheduleId;
  }
  if (scheduleMeta.schedule) {
    annotations["celerity.handler.schedule.expression"] = scheduleMeta.schedule;
  }
  appendSharedAnnotations(annotations, meta, prototype, methodName);
  return annotations;
}

function buildCustomAnnotations(
  meta: ControllerMeta,
  prototype: object,
  methodName: string,
  invokeMeta: InvokeMetadata,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};
  annotations["celerity.handler.custom"] = true;
  annotations["celerity.handler.custom.name"] = invokeMeta.name;
  appendSharedAnnotations(annotations, meta, prototype, methodName);
  return annotations;
}

// ---------------------------------------------------------------------------
// Class handler serialization
// ---------------------------------------------------------------------------

function serializeClassHandlers(
  controllerClass: Type,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry[] {
  const meta = extractControllerMeta(controllerClass);
  if (!meta) return [];

  const className = controllerClass.name;
  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((n) => n !== "constructor");
  const entries: ClassHandlerEntry[] = [];

  for (const methodName of methods) {
    // Type-specific handler decorator for the controller type.
    const typeEntry = serializeControllerTypeMethod(
      meta,
      className,
      prototype,
      methodName,
      sourceFile,
      options,
    );
    if (typeEntry) entries.push(typeEntry);

    // Cross-cutting: @ScheduleHandler on any controller type.
    const scheduleMeta: ScheduleHandlerMetadata | undefined = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      prototype,
      methodName,
    );
    if (scheduleMeta) {
      entries.push({
        resourceName: deriveClassResourceName(className, methodName),
        className,
        methodName,
        sourceFile,
        handlerType: "schedule",
        annotations: buildScheduleAnnotations(meta, prototype, methodName, scheduleMeta),
        spec: {
          handlerName: deriveClassHandlerName(className, methodName),
          codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
          handler: deriveClassHandlerFunction(sourceFile, className, methodName),
        },
      });
    }

    // Cross-cutting: @Invoke on any controller type.
    const invokeMeta: InvokeMetadata | undefined = Reflect.getOwnMetadata(
      INVOKE_METADATA,
      prototype,
      methodName,
    );
    if (invokeMeta) {
      entries.push({
        resourceName: deriveClassResourceName(className, methodName),
        className,
        methodName,
        sourceFile,
        handlerType: "custom",
        annotations: buildCustomAnnotations(meta, prototype, methodName, invokeMeta),
        spec: {
          handlerName: deriveClassHandlerName(className, methodName),
          codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
          handler: deriveClassHandlerFunction(sourceFile, className, methodName),
        },
      });
    }
  }

  return entries;
}

function serializeControllerTypeMethod(
  meta: ControllerMeta,
  className: string,
  prototype: object,
  methodName: string,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry | null {
  switch (meta.controllerType) {
    case "http":
      return serializeHttpMethod(meta, className, prototype, methodName, sourceFile, options);
    case "websocket":
      return serializeWebSocketMethod(meta, className, prototype, methodName, sourceFile, options);
    case "consumer":
      return serializeConsumerMethod(meta, className, prototype, methodName, sourceFile, options);
    default:
      return null;
  }
}

function serializeHttpMethod(
  meta: ControllerMeta,
  className: string,
  prototype: object,
  methodName: string,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry | null {
  const httpMethod: HttpMethod | undefined = Reflect.getOwnMetadata(
    HTTP_METHOD_METADATA,
    prototype,
    methodName,
  );
  if (!httpMethod) return null;

  const routePath: string =
    Reflect.getOwnMetadata(ROUTE_PATH_METADATA, prototype, methodName) ?? "/";
  const fullPath = joinHandlerPath(meta.prefix, routePath);

  return {
    resourceName: deriveClassResourceName(className, methodName),
    className,
    methodName,
    sourceFile,
    handlerType: "http",
    annotations: buildHttpAnnotations(meta, prototype, methodName, httpMethod, fullPath),
    spec: {
      handlerName: deriveClassHandlerName(className, methodName),
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveClassHandlerFunction(sourceFile, className, methodName),
    },
  };
}

function serializeWebSocketMethod(
  meta: ControllerMeta,
  className: string,
  prototype: object,
  methodName: string,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry | null {
  const wsEvent: WebSocketEventMetadata | undefined = Reflect.getOwnMetadata(
    WEBSOCKET_EVENT_METADATA,
    prototype,
    methodName,
  );
  if (!wsEvent) return null;

  return {
    resourceName: deriveClassResourceName(className, methodName),
    className,
    methodName,
    sourceFile,
    handlerType: "websocket",
    annotations: buildWebSocketAnnotations(meta, prototype, methodName, wsEvent),
    spec: {
      handlerName: deriveClassHandlerName(className, methodName),
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveClassHandlerFunction(sourceFile, className, methodName),
    },
  };
}

function serializeConsumerMethod(
  meta: ControllerMeta,
  className: string,
  prototype: object,
  methodName: string,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry | null {
  const consumerHandler: ConsumerHandlerMetadata | undefined = Reflect.getOwnMetadata(
    CONSUMER_HANDLER_METADATA,
    prototype,
    methodName,
  );
  if (!consumerHandler) return null;

  return {
    resourceName: deriveClassResourceName(className, methodName),
    className,
    methodName,
    sourceFile,
    handlerType: "consumer",
    annotations: buildConsumerAnnotations(meta, prototype, methodName, consumerHandler),
    spec: {
      handlerName: deriveClassHandlerName(className, methodName),
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveClassHandlerFunction(sourceFile, className, methodName),
    },
  };
}

// ---------------------------------------------------------------------------
// Function handler serialization
// ---------------------------------------------------------------------------

function serializeFunctionHandler(
  definition: FunctionHandlerDefinition,
  sourceFile: string,
  options: SerializeOptions,
): FunctionHandlerEntry | null {
  // "workflow" is not part of v0 — skip unsupported handler types.
  const supported = ["http", "websocket", "consumer", "schedule", "custom"] as const;
  type SupportedType = (typeof supported)[number];
  if (!supported.includes(definition.type as SupportedType)) return null;

  const exportName = (definition.metadata.handlerName as string) ?? "handler";
  const customMetadata = (definition.metadata.customMetadata as Record<string, unknown>) ?? {};
  const handlerType = definition.type as SupportedType;

  const annotations: Record<string, string | string[] | boolean> = {};

  buildFunctionTypeAnnotations(annotations, definition);

  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  return {
    resourceName: deriveFunctionResourceName(exportName),
    exportName,
    sourceFile,
    handlerType,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    spec: {
      handlerName: exportName,
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveFunctionHandlerFunction(sourceFile, exportName),
    },
  };
}

function buildFunctionTypeAnnotations(
  annotations: Record<string, string | string[] | boolean>,
  definition: FunctionHandlerDefinition,
): void {
  const meta = definition.metadata;

  switch (definition.type) {
    case "http": {
      const path = meta.path as string | undefined;
      const method = meta.method as string | undefined;
      if (path !== undefined && method !== undefined) {
        annotations["celerity.handler.http"] = true;
        annotations["celerity.handler.http.method"] = method;
        annotations["celerity.handler.http.path"] = path;
      }
      break;
    }
    case "websocket": {
      annotations["celerity.handler.websocket"] = true;
      const route = meta.route as string | undefined;
      if (route) {
        annotations["celerity.handler.websocket.route"] = route;
      }
      break;
    }
    case "consumer": {
      annotations["celerity.handler.consumer"] = true;
      const route = meta.route as string | undefined;
      if (route) {
        annotations["celerity.handler.consumer.route"] = route;
      }
      break;
    }
    case "schedule": {
      annotations["celerity.handler.schedule"] = true;
      const scheduleId = meta.scheduleId as string | undefined;
      if (scheduleId) {
        annotations["celerity.handler.schedule.scheduleId"] = scheduleId;
      }
      const schedule = meta.schedule as string | undefined;
      if (schedule) {
        annotations["celerity.handler.schedule.expression"] = schedule;
      }
      break;
    }
    case "custom": {
      annotations["celerity.handler.custom"] = true;
      const name = meta.name as string | undefined;
      if (name) {
        annotations["celerity.handler.custom.name"] = name;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Guard serialization (unchanged)
// ---------------------------------------------------------------------------

type GuardMeta = {
  guardName: string;
  customMetadata: Record<string, unknown>;
};

function extractGuardMeta(guardClass: Type): GuardMeta | null {
  const guardName: string | undefined = Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, guardClass);
  if (!guardName) return null;

  return {
    guardName,
    customMetadata: Reflect.getOwnMetadata(CUSTOM_METADATA, guardClass) ?? {},
  };
}

function serializeClassGuard(
  guardClass: Type,
  sourceFile: string,
  options: SerializeOptions,
): GuardHandlerEntry | null {
  const meta = extractGuardMeta(guardClass);
  if (!meta) return null;

  const className = guardClass.name;
  const methodName = "check";
  const annotations: Record<string, string | string[] | boolean> = {
    "celerity.handler.guard.custom": meta.guardName,
  };

  for (const [key, value] of Object.entries(meta.customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  return {
    resourceName: deriveClassResourceName(className, methodName),
    guardName: meta.guardName,
    sourceFile,
    guardType: "class",
    className,
    annotations,
    spec: {
      handlerName: deriveClassHandlerName(className, methodName),
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveClassHandlerFunction(sourceFile, className, methodName),
    },
  };
}

function serializeFunctionGuard(
  definition: GuardDefinition,
  sourceFile: string,
  options: SerializeOptions,
): GuardHandlerEntry | null {
  const guardName = definition.name;
  if (!guardName) return null;

  const meta = (definition.metadata ?? {}) as {
    customMetadata?: Record<string, unknown>;
  };
  const customMetadata = meta.customMetadata ?? {};

  const annotations: Record<string, string | string[] | boolean> = {
    "celerity.handler.guard.custom": guardName,
  };

  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  const exportName = guardName;

  return {
    resourceName: deriveFunctionResourceName(exportName),
    guardName,
    sourceFile,
    guardType: "function",
    exportName,
    annotations,
    spec: {
      handlerName: exportName,
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveFunctionHandlerFunction(sourceFile, exportName),
    },
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function serializeAnnotationValue(value: unknown): string | string[] | boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return JSON.stringify(value);
}

export function serializeToken(token: InjectionToken): string {
  if (typeof token === "function") return token.name;
  if (typeof token === "symbol") return token.description ?? "Symbol()";
  return token;
}

export function tokenType(token: InjectionToken): "class" | "string" | "symbol" {
  if (typeof token === "function") return "class";
  if (typeof token === "symbol") return "symbol";
  return "string";
}

function serializeDependencyGraph(scanned: ScannedModule): DependencyGraph {
  const nodes: DependencyNode[] = scanned.providers.map((provider) => ({
    token: serializeToken(provider.token),
    tokenType: tokenType(provider.token),
    providerType: provider.providerType,
    dependencies: provider.dependencies.map(serializeToken),
  }));

  return { nodes };
}
