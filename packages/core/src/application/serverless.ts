import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import type { ServerlessAdapter, ServerlessHandler } from "../adapters/interfaces";
import { disposeLayers } from "../layers/dispose";

export class ServerlessApplication {
  private handler: ServerlessHandler | null = null;

  constructor(
    private registry: HandlerRegistry,
    private container: Container,
    private adapter: ServerlessAdapter,
    private systemLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private appLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
  ) {}

  async start(): Promise<ServerlessHandler> {
    this.handler = this.adapter.createHandler(this.registry, {
      container: this.container,
      systemLayers: this.systemLayers,
      appLayers: this.appLayers,
    });
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
