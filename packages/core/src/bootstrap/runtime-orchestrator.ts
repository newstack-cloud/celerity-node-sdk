import type {
  CoreRuntimeApplication as CoreRuntimeApplicationType,
  CoreRuntimeAppConfig,
  CoreRuntimeConfig,
} from "@celerity-sdk/runtime";
import type { GuardResult } from "../handlers/guard-pipeline";
import { bootstrapForRuntime } from "./runtime-entry";

export type StartRuntimeOptions = {
  block?: boolean;
};

// Extended runtime types for guard handler support.
// These will be part of the auto-generated NAPI types after the next
// runtime build; until then they are declared here.
type NapiGuardInput = {
  token: string;
  request: {
    method: string;
    path: string;
    headers: Record<string, string[]>;
    query: Record<string, string[]>;
    cookies: Record<string, string>;
    body?: string;
    requestId: string;
    clientIp: string;
  };
  auth: Record<string, unknown>;
  handlerName?: string;
};

type NapiGuardResult = {
  status: string;
  auth?: Record<string, unknown>;
  message?: string;
};

type RuntimeAppWithGuards = CoreRuntimeApplicationType & {
  registerGuardHandler(
    name: string,
    handler: (err: Error | null, input: NapiGuardInput) => Promise<NapiGuardResult>,
  ): Promise<void>;
};

type AppConfigWithGuards = CoreRuntimeAppConfig & {
  api?: CoreRuntimeAppConfig["api"] & {
    guards?: { handlers: Array<{ name: string }> };
  };
};

function mapGuardResult(result: GuardResult): NapiGuardResult {
  if (result.allowed) {
    return { status: "allowed", auth: result.auth };
  }
  const status = result.statusCode === 403 ? "forbidden" : "unauthorised";
  return { status, message: result.message };
}

/**
 * Full runtime lifecycle orchestrator.
 * Dynamically imports @celerity-sdk/runtime, loads config from CELERITY_* environment
 * variables, bootstraps the user's module, registers handler callbacks, and starts the server.
 */
export async function startRuntime(options?: StartRuntimeOptions): Promise<void> {
  // Dynamic import — @celerity-sdk/runtime is an optional peer dependency.
  const pkg = "@celerity-sdk/runtime";
  const runtimeModule = (await import(pkg)) as {
    CoreRuntimeApplication: new (config: CoreRuntimeConfig) => RuntimeAppWithGuards;
    runtimeConfigFromEnv: () => CoreRuntimeConfig;
  };

  const config = runtimeModule.runtimeConfigFromEnv();
  const app = new runtimeModule.CoreRuntimeApplication(config);

  const appConfig = app.setup() as AppConfigWithGuards;

  const result = await bootstrapForRuntime();

  for (const def of appConfig.api?.http?.handlers ?? []) {
    const callback =
      result.createRouteCallback(def.path, def.method, def.name) ??
      (await result.createRouteCallbackById(def.handler, def.location, def.name));
    if (callback) {
      app.registerHttpHandler(def.path, def.method, def.timeout, callback);
    }
  }

  for (const guardDef of appConfig.api?.guards?.handlers ?? []) {
    const coreCallback = result.createGuardCallback(guardDef.name);
    if (coreCallback) {
      await app.registerGuardHandler(
        guardDef.name,
        async (_err: Error | null, input: NapiGuardInput) => {
          const coreResult = await coreCallback({
            token: input.token,
            method: input.request.method,
            path: input.request.path,
            headers: input.request.headers,
            query: input.request.query,
            cookies: input.request.cookies,
            body: input.request.body ?? null,
            requestId: input.request.requestId,
            clientIp: input.request.clientIp,
            auth: input.auth ?? {},
            handlerName: input.handlerName,
          });
          return mapGuardResult(coreResult);
        },
      );
    }
  }

  await app.run(options?.block ?? true);
}
