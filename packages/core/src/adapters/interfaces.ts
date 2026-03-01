import type { HandlerRegistry } from "../handlers/registry";
import type { PipelineOptions } from "../handlers/http-pipeline";

export type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

export interface ServerlessAdapter {
  createHttpHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
  createWebSocketHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
  createConsumerHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
  createScheduleHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
  createCustomHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
}
