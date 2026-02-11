import createDebug from "debug";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import type { Container } from "../di/container";
import type { HandlerRegistry } from "../handlers/registry";
import { disposeLayers } from "../layers/dispose";

const debug = createDebug("celerity:core:factory");

export class CelerityApplication {
  constructor(
    private registry: HandlerRegistry,
    private container: Container,
    private systemLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private appLayers: (CelerityLayer | Type<CelerityLayer>)[] = [],
    private runtimeApp?: unknown,
  ) {}

  async start(): Promise<void> {
    if (this.runtimeApp && typeof this.runtimeApp === "object") {
      const app = this.runtimeApp as { run(block: boolean): Promise<void> };
      await app.run(false);
    }
  }

  async close(): Promise<void> {
    debug("close: shutting down application");
    if (this.runtimeApp && typeof this.runtimeApp === "object") {
      const app = this.runtimeApp as { shutdown(): Promise<void> };
      await app.shutdown();
    }

    await this.container.closeAll();
    await disposeLayers([...this.systemLayers, ...this.appLayers]);
  }

  getContainer(): Container {
    return this.container;
  }

  getRegistry(): HandlerRegistry {
    return this.registry;
  }

  getSystemLayers(): (CelerityLayer | Type<CelerityLayer>)[] {
    return this.systemLayers;
  }

  getAppLayers(): (CelerityLayer | Type<CelerityLayer>)[] {
    return this.appLayers;
  }
}
