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
export { UseResource, UseResources } from "./decorators/resource";
export { SetMetadata, Action } from "./decorators/metadata";
export { Injectable, Inject } from "./decorators/injectable";
export { Module } from "./decorators/module";
export { WebSocketController, OnConnect, OnMessage, OnDisconnect } from "./decorators/websocket";
export {
  ConnectionId,
  MessageBody,
  MessageId,
  RequestContext,
  EventType,
} from "./decorators/websocket-params";
export { Consumer, MessageHandler } from "./decorators/consumer";
export { Messages, EventInput, Vendor, ConsumerTraceContext } from "./decorators/consumer-params";
export { ScheduleHandler } from "./decorators/schedule";
export {
  ScheduleInput,
  ScheduleId,
  ScheduleExpression,
  ScheduleEventInput as ScheduleEventInputParam,
} from "./decorators/schedule-params";
export { Invoke } from "./decorators/invoke";
export { Payload, InvokeContext } from "./decorators/invoke-params";

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
export { createWebSocketHandler } from "./functions/create-websocket-handler";
export { createConsumerHandler } from "./functions/create-consumer-handler";
export { createScheduleHandler } from "./functions/create-schedule-handler";
export { createCustomHandler } from "./functions/create-custom-handler";

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
export {
  TestingApplication,
  mockRequest,
  mockWebSocketMessage,
  mockConsumerEvent,
  mockScheduleEvent,
} from "./testing/test-app";

// Handler registry and resolution
export { HandlerRegistry } from "./handlers/registry";
export { routingKeyOf } from "./handlers/routing";
export { resolveHandlerByModuleRef } from "./handlers/module-resolver";
export { scanHttpHandlers, scanHttpGuards, scanModule } from "./handlers/scanners/http";
export { scanWebSocketHandlers } from "./handlers/scanners/websocket";
export { scanConsumerHandlers } from "./handlers/scanners/consumer";
export { scanScheduleHandlers } from "./handlers/scanners/schedule";
export { scanCustomHandlers } from "./handlers/scanners/custom";

// HTTP pipeline
export { executeHttpPipeline } from "./handlers/http-pipeline";

// WebSocket pipeline + sender
export { executeWebSocketPipeline } from "./handlers/websocket-pipeline";
export { RuntimeWebSocketSender } from "./handlers/websocket-sender";

// Consumer pipeline
export { executeConsumerPipeline } from "./handlers/consumer-pipeline";

// Schedule pipeline
export { executeSchedulePipeline } from "./handlers/schedule-pipeline";

// Custom pipeline
export { executeCustomPipeline } from "./handlers/custom-pipeline";

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
  WEBSOCKET_CONTROLLER_METADATA,
  WEBSOCKET_EVENT_METADATA,
  CONSUMER_METADATA,
  CONSUMER_HANDLER_METADATA,
  SCHEDULE_HANDLER_METADATA,
  INVOKE_METADATA,
  USE_RESOURCE_METADATA,
} from "./metadata/constants";

// Bootstrap
export { bootstrap, discoverModule } from "./bootstrap/index";
export { buildModuleGraph, registerModuleGraph } from "./bootstrap/index";
export { bootstrapForRuntime } from "./bootstrap/index";
export { startRuntime } from "./bootstrap/index";
export {
  mapRuntimeRequest,
  mapToRuntimeResponse,
  mapWebSocketMessage,
  mapConsumerEventInput,
  mapScheduleEventInput,
  mapToNapiEventResult,
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
  WebSocketEventType,
  WebSocketMessageType,
  WebSocketMessage,
  WebSocketRequestContext,
  WebSocketHandlerContext,
  WebSocketSendOptions,
  ConsumerMessage,
  ConsumerEventInput,
  ConsumerHandlerContext,
  MessageProcessingFailure,
  EventResult,
  ValidatedConsumerMessage,
  ScheduleEventInput,
  ScheduleHandlerContext,
} from "@celerity-sdk/types";

// WebSocketSender is both a type (interface) and a value (DI token symbol).
export { WebSocketSender } from "@celerity-sdk/types";

// Re-export types defined in core
export type { ControllerMetadata } from "./decorators/controller";
export type { ParamType, ParamMetadata } from "./decorators/params";
export type { PipelineOptions } from "./handlers/http-pipeline";
export type {
  HandlerType,
  ResolvedHandlerBase,
  ResolvedHttpHandler,
  ResolvedHandler,
  ResolvedWebSocketHandler,
  ResolvedConsumerHandler,
  ResolvedScheduleHandler,
  ResolvedCustomHandler,
} from "./handlers/types";
export type { HttpHandlerRequest, HttpFunctionContext } from "./functions/context";
export type { HttpHandlerConfig } from "./functions/create-handler";
export type {
  GuardConfig,
  GuardHandlerFn,
  GuardRequest,
  GuardContext,
} from "./functions/create-guard";
export type { ResolvedGuard } from "./handlers/types";
export type { GuardInput, GuardResult, GuardPipelineOptions } from "./handlers/guard-pipeline";
export type { ValidationSchemas } from "./layers/validate";
export type { CreateOptions } from "./application/factory";
export type {
  MockRequestOptions,
  MockWebSocketMessageOptions,
  MockConsumerMessage,
  MockConsumerEventOptions,
  MockScheduleEventOptions,
} from "./testing/test-app";
export type { BootstrapResult } from "./bootstrap/index";
export type { RuntimeBootstrapResult } from "./bootstrap/index";
export type { ModuleNode, ModuleGraph } from "./bootstrap/index";
export type { StartRuntimeOptions } from "./bootstrap/runtime-orchestrator";
export type { WebSocketEventMetadata } from "./decorators/websocket";
export type { WebSocketHandlerConfig } from "./functions/create-websocket-handler";
export type { WebSocketPipelineOptions } from "./handlers/websocket-pipeline";
export type { CoreWebSocketRegistry } from "./handlers/websocket-sender";
export type {
  JsWebSocketMessageInfo,
  JsConsumerEventInput,
  JsScheduleEventInput,
  JsEventResult,
} from "./bootstrap/index";
export type { ConsumerMetadata, ConsumerHandlerMetadata } from "./decorators/consumer";
export type { ConsumerHandlerConfig } from "./functions/create-consumer-handler";
export type { ConsumerPipelineOptions } from "./handlers/consumer-pipeline";
export type { ScheduleHandlerMetadata } from "./decorators/schedule";
export type { ScheduleHandlerConfig } from "./functions/create-schedule-handler";
export type { SchedulePipelineOptions } from "./handlers/schedule-pipeline";
export type { InvokeMetadata } from "./decorators/invoke";
export type { CustomHandlerConfig } from "./functions/create-custom-handler";
export type { CustomPipelineOptions } from "./handlers/custom-pipeline";
