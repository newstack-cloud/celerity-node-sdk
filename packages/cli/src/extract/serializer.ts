import "reflect-metadata";
import type { Type, HttpMethod, InjectionToken } from "@celerity-sdk/types";
import {
  CONTROLLER_METADATA,
  HTTP_METHOD_METADATA,
  ROUTE_PATH_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  GUARD_CUSTOM_METADATA,
  PUBLIC_METADATA,
  CUSTOM_METADATA,
} from "@celerity-sdk/core";
import type { ControllerMetadata } from "@celerity-sdk/core";
import type { ScannedModule } from "./metadata-app";
import type {
  HandlerManifest,
  ClassHandlerEntry,
  FunctionHandlerEntry,
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

  for (const controllerClass of scanned.controllerClasses) {
    const entries = serializeClassHandler(controllerClass, sourceFile, options);
    handlers.push(...entries);
  }

  for (const fnHandler of scanned.functionHandlers) {
    const entry = serializeFunctionHandler(fnHandler, sourceFile, options);
    if (entry) {
      functionHandlers.push(entry);
    }
  }

  return {
    version: "1.0.0",
    handlers,
    functionHandlers,
    dependencyGraph: serializeDependencyGraph(scanned),
  };
}

type ClassMeta = {
  prefix: string;
  protectedBy: string[];
  customGuardName: string | undefined;
  customMetadata: Record<string, unknown>;
};

function extractClassMeta(controllerClass: Type): ClassMeta | null {
  const controllerMeta: ControllerMetadata | undefined = Reflect.getOwnMetadata(
    CONTROLLER_METADATA,
    controllerClass,
  );
  if (!controllerMeta) return null;

  return {
    prefix: controllerMeta.prefix ?? "",
    protectedBy: Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, controllerClass) ?? [],
    customGuardName: Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, controllerClass),
    customMetadata: Reflect.getOwnMetadata(CUSTOM_METADATA, controllerClass) ?? {},
  };
}

function buildMethodAnnotations(
  classMeta: ClassMeta,
  prototype: object,
  methodName: string,
  httpMethod: HttpMethod,
  fullPath: string,
): Record<string, string | string[] | boolean> {
  const annotations: Record<string, string | string[] | boolean> = {};

  annotations["celerity.handler.http"] = true;
  annotations["celerity.handler.http.method"] = httpMethod;
  annotations["celerity.handler.http.path"] = fullPath;

  const methodProtectedBy: string[] =
    Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, prototype, methodName) ?? [];
  const allProtectedBy = [...classMeta.protectedBy, ...methodProtectedBy];
  if (allProtectedBy.length > 0) {
    annotations["celerity.handler.guard.protectedBy"] = allProtectedBy;
  }
  if (classMeta.customGuardName) {
    annotations["celerity.handler.guard.custom"] = classMeta.customGuardName;
  }

  const isPublic: boolean = Reflect.getOwnMetadata(PUBLIC_METADATA, prototype, methodName) === true;
  if (isPublic) {
    annotations["celerity.handler.public"] = true;
  }

  const methodCustomMetadata: Record<string, unknown> =
    Reflect.getOwnMetadata(CUSTOM_METADATA, prototype, methodName) ?? {};
  const customMetadata = { ...classMeta.customMetadata, ...methodCustomMetadata };
  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  return annotations;
}

function serializeClassHandler(
  controllerClass: Type,
  sourceFile: string,
  options: SerializeOptions,
): ClassHandlerEntry[] {
  const classMeta = extractClassMeta(controllerClass);
  if (!classMeta) return [];

  const className = controllerClass.name;
  const prototype = controllerClass.prototype as object;
  const methods = Object.getOwnPropertyNames(prototype).filter((n) => n !== "constructor");
  const entries: ClassHandlerEntry[] = [];

  for (const methodName of methods) {
    const httpMethod: HttpMethod | undefined = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      prototype,
      methodName,
    );
    if (!httpMethod) continue;

    const routePath: string =
      Reflect.getOwnMetadata(ROUTE_PATH_METADATA, prototype, methodName) ?? "/";
    const fullPath = joinHandlerPath(classMeta.prefix, routePath);
    const annotations = buildMethodAnnotations(
      classMeta,
      prototype,
      methodName,
      httpMethod,
      fullPath,
    );

    entries.push({
      resourceName: deriveClassResourceName(className, methodName),
      className,
      methodName,
      sourceFile,
      handlerType: "http",
      annotations,
      spec: {
        handlerName: deriveClassHandlerName(className, methodName),
        codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
        handler: deriveClassHandlerFunction(sourceFile, className, methodName),
      },
    });
  }

  return entries;
}

function serializeFunctionHandler(
  definition: { metadata: Record<string, unknown>; handler: (...args: unknown[]) => unknown },
  sourceFile: string,
  options: SerializeOptions,
): FunctionHandlerEntry | null {
  // Function handlers don't have a reliable export name from the definition alone.
  // The CLI entry point will need to derive this from the module's named exports.
  // For now, use "handler" as a placeholder — the CLI enriches this.
  const exportName = (definition.metadata.handlerName as string) ?? "handler";
  const customMetadata = (definition.metadata.customMetadata as Record<string, unknown>) ?? {};

  const annotations: Record<string, string | string[] | boolean> = {};

  const path = definition.metadata.path as string | undefined;
  const method = definition.metadata.method as string | undefined;
  if (path !== undefined && method !== undefined) {
    annotations["celerity.handler.http"] = true;
    annotations["celerity.handler.http.method"] = method;
    annotations["celerity.handler.http.path"] = path;
  }

  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === undefined) continue;
    annotations[`celerity.handler.metadata.${key}`] = serializeAnnotationValue(value);
  }

  return {
    resourceName: deriveFunctionResourceName(exportName),
    exportName,
    sourceFile,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    spec: {
      handlerName: exportName,
      codeLocation: deriveCodeLocation(sourceFile, options.projectRoot),
      handler: deriveFunctionHandlerFunction(sourceFile, exportName),
    },
  };
}

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
