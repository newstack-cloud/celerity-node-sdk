import type { HandlerRegistry } from "../handlers/registry";
import type { PipelineOptions } from "../handlers/pipeline";

export type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

export interface ServerlessAdapter {
  createHandler(registry: HandlerRegistry, options: PipelineOptions): ServerlessHandler;
}
