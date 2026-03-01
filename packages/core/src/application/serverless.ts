import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import type { ServerlessAdapter, ServerlessHandler } from "../adapters/interfaces";
import type { HandlerType } from "../handlers/types";
import type { PipelineOptions } from "../handlers/http-pipeline";
import { disposeLayers } from "../layers/dispose";

const HANDLER_CREATORS: Record<
  HandlerType,
  (
    adapter: ServerlessAdapter,
    registry: HandlerRegistry,
    options: PipelineOptions,
  ) => ServerlessHandler
> = {
  http: (adapter, registry, options) => adapter.createHttpHandler(registry, options),
  websocket: (adapter, registry, options) => adapter.createWebSocketHandler(registry, options),
  consumer: (adapter, registry, options) => adapter.createConsumerHandler(registry, options),
  schedule: (adapter, registry, options) => adapter.createScheduleHandler(registry, options),
  custom: (adapter, registry, options) => adapter.createCustomHandler(registry, options),
};

export class ServerlessApplication {
  private handler: ServerlessHandler | null = null;

  constructor(
    private registry: HandlerRegistry,
    private container: Container,
    private adapter: ServerlessAdapter,
    private systemLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private appLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
  ) {}

  createHandler(type: HandlerType): ServerlessHandler {
    const options: PipelineOptions = {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    };
    return HANDLER_CREATORS[type](this.adapter, this.registry, options);
  }

  async start(type: HandlerType = "http"): Promise<ServerlessHandler> {
    this.handler = this.createHandler(type);
    return this.handler;
  }

  async close(): Promise<void> {
    await this.container.closeAll();
    await disposeLayers([...this.systemLayers, ...this.appLayers]);
  }

  getHandler(): ServerlessHandler {
    if (!this.handler) {
      throw new Error("ServerlessApplication.start() must be called before getHandler()");
    }
    return this.handler;
  }

  getContainer(): Container {
    return this.container;
  }

  getRegistry(): HandlerRegistry {
    return this.registry;
  }
}
