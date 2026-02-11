import type {
  CoreRuntimeApplication as CoreRuntimeApplicationType,
  CoreRuntimeAppConfig,
  CoreRuntimeConfig,
} from "@celerity-sdk/runtime";
import { bootstrapForRuntime } from "./runtime-entry";

export type StartRuntimeOptions = {
  block?: boolean;
};

/**
 * Full runtime lifecycle orchestrator.
 * Dynamically imports @celerity-sdk/runtime, loads config from CELERITY_* environment
 * variables, bootstraps the user's module, registers handler callbacks, and starts the server.
 */
export async function startRuntime(options?: StartRuntimeOptions): Promise<void> {
  // Dynamic import — @celerity-sdk/runtime is an optional peer dependency.
  const pkg = "@celerity-sdk/runtime";
  const runtimeModule = (await import(pkg)) as {
    CoreRuntimeApplication: new (config: CoreRuntimeConfig) => CoreRuntimeApplicationType;
    runtimeConfigFromEnv: () => CoreRuntimeConfig;
  };

  const config = runtimeModule.runtimeConfigFromEnv();
  const app = new runtimeModule.CoreRuntimeApplication(config);

  const appConfig: CoreRuntimeAppConfig = app.setup();

  const result = await bootstrapForRuntime();

  for (const def of appConfig.api?.http?.handlers ?? []) {
    const callback =
      result.createRouteCallback(def.path, def.method) ??
      (await result.createRouteCallbackById(def.handler, def.location));
    if (callback) {
      app.registerHttpHandler(def.path, def.method, def.timeout, callback);
    }
  }

  await app.run(options?.block ?? true);
}
