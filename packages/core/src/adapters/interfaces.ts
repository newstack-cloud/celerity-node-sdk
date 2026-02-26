import type { HttpHandlerRegistry } from "../handlers/registry";
import type { PipelineOptions } from "../handlers/pipeline";

export type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

export interface ServerlessAdapter {
  createHttpHandler(registry: HttpHandlerRegistry, options: PipelineOptions): ServerlessHandler;
}
