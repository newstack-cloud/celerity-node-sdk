import "reflect-metadata";
import type {
  HttpMethod,
  CelerityLayer,
  ModuleMetadata,
  FunctionHandlerDefinition,
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
  LAYER_METADATA,
  MODULE_METADATA,
  PUBLIC_METADATA,
  CUSTOM_METADATA,
} from "../metadata/constants";
import type { ControllerMetadata } from "../decorators/controller";
import type { ParamMetadata } from "../decorators/params";
import type { ResolvedHandler } from "./pipeline";
import { validate, type ValidationSchemas } from "../layers/validate";
import type { Container } from "../di/container";
import type { ModuleGraph } from "../bootstrap/module-graph";

export class HandlerRegistry {
  private handlers: ResolvedHandler[] = [];

  getHandler(path: string, method: string): ResolvedHandler | undefined {
    return this.handlers.find(
      (h) =>
        h.path !== undefined &&
        h.method !== undefined &&
        matchRoute(h.path, path) &&
        h.method === method,
    );
  }

  getAllHandlers(): ResolvedHandler[] {
    return [...this.handlers];
  }

  async populateFromGraph(graph: ModuleGraph, container: Container): Promise<void> {
    for (const [, node] of graph) {
      for (const controllerClass of node.controllers) {
        await this.registerClassHandler(controllerClass, container);
      }
      for (const fnHandler of node.functionHandlers) {
        this.registerFunctionHandler(fnHandler);
      }
    }
  }

  async scanModule(moduleClass: Type, container: Container): Promise<void> {
    const metadata: ModuleMetadata | undefined = Reflect.getOwnMetadata(
      MODULE_METADATA,
      moduleClass,
    );
    if (!metadata) return;

    if (metadata.imports) {
      for (const imported of metadata.imports) {
        await this.scanModule(imported, container);
      }
    }

    if (metadata.controllers) {
      for (const controllerClass of metadata.controllers) {
        await this.registerClassHandler(controllerClass, container);
      }
    }

    if (metadata.functionHandlers) {
      for (const fnHandler of metadata.functionHandlers) {
        this.registerFunctionHandler(fnHandler);
      }
    }
  }

  private async registerClassHandler(controllerClass: Type, container: Container): Promise<void> {
    const controllerMeta: ControllerMetadata | undefined = Reflect.getOwnMetadata(
      CONTROLLER_METADATA,
      controllerClass,
    );
    if (!controllerMeta) return;

    const instance = await container.resolve<object>(controllerClass);
    const prototype = Object.getPrototypeOf(instance) as object;
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

      const layers = [...classLayers, ...methodLayers];
      const validationSchemas = buildValidationSchemasFromParams(paramMetadata);
      if (validationSchemas) {
        layers.unshift(validate(validationSchemas));
      }

      this.handlers.push({
        path: fullPath,
        method,
        protectedBy: [...classProtectedBy, ...methodProtectedBy],
        layers,
        isPublic,
        paramMetadata,
        customMetadata: { ...classCustomMetadata, ...methodCustomMetadata },
        handlerFn: descriptor.value as (...args: unknown[]) => unknown,
        handlerInstance: instance,
      });
    }
  }

  private registerFunctionHandler(definition: FunctionHandlerDefinition): void {
    if (definition.type !== "http") return;

    const meta = definition.metadata as {
      path?: string;
      method?: HttpMethod;
      schema?: { body?: Schema; query?: Schema; params?: Schema; headers?: Schema };
      layers?: (CelerityLayer | Type<CelerityLayer>)[];
      inject?: InjectionToken[];
      customMetadata?: Record<string, unknown>;
    };

    const layers = [...(meta.layers ?? [])];
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

    this.handlers.push({
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
}

function matchRoute(pattern: string, actual: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);

  if (patternParts.length !== actualParts.length) return false;

  return patternParts.every((part, i) => part.startsWith("{") || part === actualParts[i]);
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
