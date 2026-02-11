import createDebug from "debug";
import type { CelerityLayer, Type } from "@celerity-sdk/types";
import { bootstrap } from "../bootstrap/bootstrap";
import { CelerityApplication } from "./application";
import { ServerlessApplication } from "./serverless";
import { TestingApplication } from "../testing/test-app";
import type { ServerlessAdapter } from "../adapters/interfaces";
import { createDefaultSystemLayers } from "../layers/system";

const debug = createDebug("celerity:core:factory");

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
    debug("create: bootstrapping %s", rootModule.name);

    // Resolve system layers first.
    // If telemetry is present + enabled, this triggers OTel SDK init
    // and registers auto-instrumentations before user module imports.
    const systemLayers = options?.systemLayers ?? (await createDefaultSystemLayers());
    const appLayers = options?.layers ?? [];
    debug("create: %d system layers, %d app layers", systemLayers.length, appLayers.length);

    // Bootstrap user module after auto-instrumentations are registered.
    const { container, registry } = await bootstrap(rootModule);

    if (options?.adapter) {
      debug("create: using adapter → ServerlessApplication");
      return new ServerlessApplication(
        registry,
        container,
        options.adapter,
        systemLayers,
        appLayers,
      );
    }

    debug("create: → CelerityApplication");
    return new CelerityApplication(registry, container, systemLayers, appLayers);
  }

  static async createTestingApp(
    rootModule: Type,
    options?: CreateOptions,
  ): Promise<TestingApplication> {
    debug("createTestingApp: bootstrapping %s", rootModule.name);
    const { container, registry } = await bootstrap(rootModule);
    const systemLayers = options?.systemLayers ?? [];
    const appLayers = options?.layers ?? [];
    return new TestingApplication(registry, container, systemLayers, appLayers);
  }
}
