import "reflect-metadata";

// Decorators
export { Controller } from "./decorators/controller";
export { Get, Post, Put, Patch, Delete, Head, Options } from "./decorators/http";
export {
  Body,
  Query,
  Param,
  Headers,
  Auth,
  Token,
  Req,
  Cookies,
  RequestId,
} from "./decorators/params";
export { Guard, ProtectedBy, Public } from "./decorators/guards";
export { UseLayer, UseLayers } from "./decorators/layer";
export { SetMetadata, Action } from "./decorators/metadata";
export { Injectable, Inject } from "./decorators/injectable";
export { Module } from "./decorators/module";

// Layers
export { validate } from "./layers/validate";
export { runLayerPipeline } from "./layers/pipeline";
export { createDefaultSystemLayers } from "./layers/system";
export { disposeLayers } from "./layers/dispose";

// Metadata
export { HandlerMetadataStore } from "./metadata/handler-metadata";

// DI
export { Container, tokenToString } from "./di/container";
export { getClassDependencyTokens, getProviderDependencyTokens } from "./di/dependency-tokens";
export { APP_CONFIG, RUNTIME_APP } from "./di/tokens";

// Application
export { CelerityFactory } from "./application/factory";
export { CelerityApplication } from "./application/application";
export { ServerlessApplication } from "./application/serverless";

// Functions
export {
  createHttpHandler,
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
} from "./functions/create-handler";
export { createGuard } from "./functions/create-guard";

// Errors
export {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  MethodNotAllowedException,
  NotAcceptableException,
  ConflictException,
  GoneException,
  UnprocessableEntityException,
  TooManyRequestsException,
  InternalServerErrorException,
  NotImplementedException,
  BadGatewayException,
  ServiceUnavailableException,
  GatewayTimeoutException,
} from "./errors/http-exception";

// Testing
export { TestingApplication, mockRequest } from "./testing/test-app";

// Handler pipeline
export { executeHandlerPipeline } from "./handlers/pipeline";
export { HttpHandlerRegistry } from "./handlers/registry";
export { resolveHandlerByModuleRef } from "./handlers/module-resolver";

// Guard pipeline
export { executeGuardPipeline } from "./handlers/guard-pipeline";

// Metadata constants (used by extraction tools)
export {
  CONTROLLER_METADATA,
  HTTP_METHOD_METADATA,
  ROUTE_PATH_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  GUARD_CUSTOM_METADATA,
  PUBLIC_METADATA,
  MODULE_METADATA,
  LAYER_METADATA,
  CUSTOM_METADATA,
  INJECT_METADATA,
} from "./metadata/constants";

// Bootstrap
export { bootstrap, discoverModule } from "./bootstrap/index";
export { buildModuleGraph, registerModuleGraph } from "./bootstrap/index";
export { bootstrapForRuntime } from "./bootstrap/index";
export { startRuntime } from "./bootstrap/index";
export {
  mapRuntimeRequest,
  mapToRuntimeResponse,
  flattenMultiValueRecord,
} from "./bootstrap/index";

// Adapter interfaces
export type { ServerlessAdapter, ServerlessHandler } from "./adapters/interfaces";

// Re-export key types from @celerity-sdk/types
export type {
  Type,
  InjectionToken,
  Provider,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HandlerMetadata,
  BaseHandlerContext,
  HttpHandlerContext,
  HandlerResponse,
  NextFunction,
  CelerityLayer,
  Schema,
  ModuleMetadata,
  FunctionHandlerDefinition,
  ServiceContainer,
  GuardDefinition,
  GuardHandlerContext,
  GuardHandlerRequest,
  CelerityLogger,
} from "@celerity-sdk/types";

// Re-export types defined in core
export type { ControllerMetadata } from "./decorators/controller";
export type { ParamType, ParamMetadata } from "./decorators/params";
export type { ResolvedHandler, PipelineOptions } from "./handlers/pipeline";
export type { HttpHandlerRequest, HttpFunctionContext } from "./functions/context";
export type { HttpHandlerConfig } from "./functions/create-handler";
export type {
  GuardConfig,
  GuardHandlerFn,
  GuardRequest,
  GuardContext,
} from "./functions/create-guard";
export type { ResolvedGuard } from "./handlers/registry";
export type { GuardInput, GuardResult, GuardPipelineOptions } from "./handlers/guard-pipeline";
export type { ValidationSchemas } from "./layers/validate";
export type { CreateOptions } from "./application/factory";
export type { MockRequestOptions } from "./testing/test-app";
export type { BootstrapResult } from "./bootstrap/index";
export type { RuntimeBootstrapResult } from "./bootstrap/index";
export type { ModuleNode, ModuleGraph } from "./bootstrap/index";
export type { StartRuntimeOptions } from "./bootstrap/runtime-orchestrator";
