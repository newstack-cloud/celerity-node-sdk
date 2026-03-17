import "reflect-metadata";
import createDebug from "debug";
import type {
  HttpMethod,
  CelerityLayer,
  FunctionHandlerDefinition,
  GuardDefinition,
  Type,
  Schema,
  InjectionToken,
} from "@celerity-sdk/types";
import { joinHandlerPath } from "@celerity-sdk/common";
import {
  CONTROLLER_METADATA,
  HTTP_METHOD_METADATA,
  ROUTE_PATH_METADATA,
  PARAM_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  GUARD_CUSTOM_METADATA,
  LAYER_METADATA,
  PUBLIC_METADATA,
  CUSTOM_METADATA,
} from "../../metadata/constants";
import type { ControllerMetadata } from "../../decorators/controller";
import type { ParamMetadata } from "../../decorators/params";
import { validate, type ValidationSchemas } from "../../layers/validate";
import type { Container } from "../../di/container";
import { buildModuleGraph, registerModuleGraph } from "../../bootstrap/module-graph";
import type { ModuleGraph } from "../../bootstrap/module-graph";
import type { HandlerRegistry } from "../registry";

const debug = createDebug("celerity:core:scanner:http");

/**
 * Scans the module graph for HTTP class handlers and function handlers,
 * registering them in the handler registry.
 */
export async function scanHttpHandlers(
  graph: ModuleGraph,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  for (const [, node] of graph) {
    for (const controllerClass of node.controllers) {
      await scanClassHandler(controllerClass, container, registry, node.layers);
    }
    for (const fnHandler of node.functionHandlers) {
      scanFunctionHandler(fnHandler, registry, node.layers);
    }
  }
}

/**
 * Scans the module graph for guard definitions (class-based and function-based),
 * registering them in the handler registry.
 */
export async function scanHttpGuards(
  graph: ModuleGraph,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  for (const [, node] of graph) {
    for (const guard of node.guards) {
      if (typeof guard === "function") {
        await scanClassGuard(guard, container, registry);
      } else {
        scanFunctionGuard(guard, registry);
      }
    }
  }
}

/**
 * Convenience function that builds a module graph, registers providers,
 * and scans for HTTP handlers and guards in a single call.
 */
export async function scanModule(
  moduleClass: Type,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  const graph = buildModuleGraph(moduleClass);
  registerModuleGraph(graph, container);
  await scanHttpHandlers(graph, container, registry);
  await scanHttpGuards(graph, container, registry);
}

async function scanClassHandler(
  controllerClass: Type,
  container: Container,
  registry: HandlerRegistry,
  moduleLayers: (CelerityLayer | Type<CelerityLayer>)[],
): Promise<void> {
  const controllerMeta: ControllerMetadata | undefined = Reflect.getOwnMetadata(
    CONTROLLER_METADATA,
    controllerClass,
  );
  if (!controllerMeta) return;

  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");

  const classProtectedBy: string[] =
    Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, controllerClass) ?? [];
  const classLayers: (CelerityLayer | Type<CelerityLayer>)[] =
    Reflect.getOwnMetadata(LAYER_METADATA, controllerClass) ?? [];
  const classCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {};

  for (const methodName of methods) {
    const method: HttpMethod | undefined = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      prototype,
      methodName,
    );
    if (!method) continue;

    const routePath: string =
      Reflect.getOwnMetadata(ROUTE_PATH_METADATA, prototype, methodName) ?? "/";
    const fullPath = joinHandlerPath(controllerMeta.prefix ?? "", routePath);

    const methodProtectedBy: string[] =
      Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, prototype, methodName) ?? [];
    const methodLayers: (CelerityLayer | Type<CelerityLayer>)[] =
      Reflect.getOwnMetadata(LAYER_METADATA, prototype, methodName) ?? [];
    const paramMetadata: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, prototype, methodName) ?? [];
    const isPublic: boolean =
      Reflect.getOwnMetadata(PUBLIC_METADATA, prototype, methodName) === true;
    const methodCustomMetadata: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor?.value || typeof descriptor.value !== "function") continue;

    const layers = [...moduleLayers, ...classLayers, ...methodLayers];
    const validationSchemas = buildValidationSchemasFromParams(paramMetadata);
    if (validationSchemas) {
      layers.unshift(validate(validationSchemas));
    }

    debug("scanClassHandler: %s %s (%s.%s)", method, fullPath, controllerClass.name, methodName);
    registry.register({
      type: "http",
      path: fullPath,
      method,
      protectedBy: [...classProtectedBy, ...methodProtectedBy],
      layers,
      isPublic,
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
  moduleLayers: (CelerityLayer | Type<CelerityLayer>)[],
): void {
  if (definition.type !== "http") return;

  const meta = definition.metadata as {
    path?: string;
    method?: HttpMethod;
    schema?: { body?: Schema; query?: Schema; params?: Schema; headers?: Schema };
    layers?: (CelerityLayer | Type<CelerityLayer>)[];
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  const layers = [...moduleLayers, ...(meta.layers ?? [])];
  if (meta.schema) {
    const schemas: Record<string, Schema> = {};
    if (meta.schema.body) schemas.body = meta.schema.body;
    if (meta.schema.query) schemas.query = meta.schema.query;
    if (meta.schema.params) schemas.params = meta.schema.params;
    if (meta.schema.headers) schemas.headers = meta.schema.headers;
    if (Object.keys(schemas).length > 0) {
      layers.unshift(validate(schemas));
    }
  }

  debug(
    "scanFunctionHandler: %s",
    definition.id ?? (meta.method && meta.path ? `${meta.method} ${meta.path}` : "(no route)"),
  );
  registry.register({
    type: "http",
    id: definition.id,
    path: meta.path,
    method: meta.method,
    protectedBy: [],
    layers,
    isPublic: false,
    paramMetadata: [],
    customMetadata: meta.customMetadata ?? {},
    handlerFn: definition.handler,
    isFunctionHandler: true,
    injectTokens: meta.inject ?? [],
  });
}

async function scanClassGuard(
  guardClass: Type,
  container: Container,
  registry: HandlerRegistry,
): Promise<void> {
  const guardName: string | undefined = Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, guardClass);
  if (!guardName) return;

  const prototype = guardClass.prototype as object;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "check");
  if (!descriptor?.value || typeof descriptor.value !== "function") {
    debug("scanClassGuard: %s has no check() method, skipping", guardClass.name);
    return;
  }

  const paramMetadata: ParamMetadata[] =
    Reflect.getOwnMetadata(PARAM_METADATA, prototype, "check") ?? [];
  const customMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, guardClass) ?? {};

  debug("scanClassGuard: %s (name=%s)", guardClass.name, guardName);
  registry.registerGuard({
    name: guardName,
    handlerFn: descriptor.value as (...args: unknown[]) => unknown,
    guardClass,
    paramMetadata,
    customMetadata,
  });
}

function scanFunctionGuard(definition: GuardDefinition, registry: HandlerRegistry): void {
  const name = definition.name;
  if (!name) {
    debug("scanFunctionGuard: no name, skipping");
    return;
  }

  const meta = (definition.metadata ?? {}) as {
    inject?: InjectionToken[];
    customMetadata?: Record<string, unknown>;
  };

  debug("scanFunctionGuard: %s", name);
  registry.registerGuard({
    name,
    handlerFn: definition.handler,
    customMetadata: meta.customMetadata ?? {},
    paramMetadata: [],
    isFunctionGuard: true,
    injectTokens: meta.inject ?? [],
  });
}

const PARAM_TYPE_TO_SCHEMA_KEY: Record<string, keyof ValidationSchemas> = {
  body: "body",
  query: "query",
  param: "params",
  headers: "headers",
};

function buildValidationSchemasFromParams(
  paramMetadata: ParamMetadata[],
): ValidationSchemas | null {
  const wholeObjectSchemas = new Map<keyof ValidationSchemas, Schema>();
  const perKeySchemas = new Map<keyof ValidationSchemas, Map<string, Schema>>();

  for (const meta of paramMetadata) {
    if (!meta.schema) continue;
    const schemaKey = PARAM_TYPE_TO_SCHEMA_KEY[meta.type];
    if (!schemaKey) continue;

    if (meta.key) {
      let keyMap = perKeySchemas.get(schemaKey);
      if (!keyMap) {
        keyMap = new Map();
        perKeySchemas.set(schemaKey, keyMap);
      }
      keyMap.set(meta.key, meta.schema);
    } else {
      wholeObjectSchemas.set(schemaKey, meta.schema);
    }
  }

  const schemas: ValidationSchemas = {};
  let hasSchemas = false;

  for (const key of ["body", "query", "params", "headers"] as (keyof ValidationSchemas)[]) {
    if (wholeObjectSchemas.has(key)) {
      schemas[key] = wholeObjectSchemas.get(key)!;
      hasSchemas = true;
    } else if (perKeySchemas.has(key)) {
      schemas[key] = composeKeySchemas(perKeySchemas.get(key)!);
      hasSchemas = true;
    }
  }

  return hasSchemas ? schemas : null;
}

function composeKeySchemas(keySchemas: Map<string, Schema>): Schema {
  return {
    parse(data: unknown): Record<string, unknown> {
      const record = data as Record<string, unknown>;
      const result: Record<string, unknown> = { ...record };
      for (const [key, schema] of keySchemas) {
        if (key in result) {
          result[key] = schema.parse(result[key]);
        }
      }
      return result;
    },
  };
}
