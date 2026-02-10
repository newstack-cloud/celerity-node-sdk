import type { CelerityLayer, Type } from "@celerity-sdk/types";
import { bootstrap } from "../bootstrap/bootstrap";
import { CelerityApplication } from "./application";
import { ServerlessApplication } from "./serverless";
import { TestingApplication } from "../testing/test-app";
import type { ServerlessAdapter } from "../adapters/interfaces";
import { createDefaultSystemLayers } from "../layers/system";

export type CreateOptions = {
  adapter?: ServerlessAdapter;
  /** App-wide layers that run after system layers but before handler layers. */
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  /**
   * Override the default system layer stack.
   * @internal Used by TestingApplication and runtime orchestrator.
   */
  systemLayers?: (CelerityLayer | Type<CelerityLayer>)[];
};

export class CelerityFactory {
  static async create(
    rootModule: Type,
    options?: CreateOptions,
  ): Promise<CelerityApplication | ServerlessApplication> {
    // Resolve system layers first.
    // If telemetry is present + enabled, this triggers OTel SDK init
    // and registers auto-instrumentations before user module imports.
    const systemLayers = options?.systemLayers ?? (await createDefaultSystemLayers());
    const appLayers = options?.layers ?? [];

    // Bootstrap user module after auto-instrumentations are registered.
    const { container, registry } = await bootstrap(rootModule);

    if (options?.adapter) {
      return new ServerlessApplication(
        registry,
        container,
        options.adapter,
        systemLayers,
        appLayers,
      );
    }

    return new CelerityApplication(registry, container, systemLayers, appLayers);
  }

  static async createTestingApp(
    rootModule: Type,
    options?: CreateOptions,
  ): Promise<TestingApplication> {
    const { container, registry } = await bootstrap(rootModule);
    const systemLayers = options?.systemLayers ?? [];
    const appLayers = options?.layers ?? [];
    return new TestingApplication(registry, container, systemLayers, appLayers);
  }
}
