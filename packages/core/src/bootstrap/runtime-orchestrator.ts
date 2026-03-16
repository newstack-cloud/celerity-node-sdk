import type {
  CoreRuntimeApplication as CoreRuntimeApplicationType,
  CoreRuntimeConfig,
  GuardInput as RuntimeGuardInput,
  GuardResult as RuntimeGuardResult,
} from "@celerity-sdk/runtime";
import { WebSocketSender } from "@celerity-sdk/types";
import type { GuardResult } from "../handlers/guard-pipeline";
import type { RuntimeBootstrapResult } from "./runtime-entry";
import { RuntimeWebSocketSender } from "../handlers/websocket-sender";
import { bootstrapForRuntime } from "./runtime-entry";

export type StartRuntimeOptions = {
  block?: boolean;
};

type RuntimeModule = {
  CoreRuntimeApplication: new (config: CoreRuntimeConfig) => CoreRuntimeApplicationType;
  runtimeConfigFromEnv: () => CoreRuntimeConfig;
};

async function loadRuntime(): Promise<{
  app: CoreRuntimeApplicationType;
  appConfig: ReturnType<CoreRuntimeApplicationType["setup"]>;
}> {
  // Dynamic import — @celerity-sdk/runtime is an optional peer dependency.
  const pkg = "@celerity-sdk/runtime";
  const runtimeModule = (await import(pkg)) as RuntimeModule;

  const config = runtimeModule.runtimeConfigFromEnv();
  const app = new runtimeModule.CoreRuntimeApplication(config);
  const appConfig = app.setup();

  return { app, appConfig };
}

function mapGuardResult(result: GuardResult): RuntimeGuardResult {
  if (result.allowed) {
    return { status: "allowed", auth: result.auth };
  }
  const status = result.statusCode === 403 ? "forbidden" : "unauthorised";
  return { status, message: result.message };
}

async function registerHttpHandlers(
  app: CoreRuntimeApplicationType,
  handlers: ReturnType<CoreRuntimeApplicationType["setup"]>["api"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const def of handlers?.http?.handlers ?? []) {
    const callback =
      result.createRouteCallback(def.method, def.path, def.name) ??
      (await result.createRouteCallbackById(def.handler, def.location, def.name));
    if (callback) {
      app.registerHttpHandler(def.path, def.method, def.timeout, callback);
    }
  }
}

async function registerGuardHandlers(
  app: CoreRuntimeApplicationType,
  guards: NonNullable<ReturnType<CoreRuntimeApplicationType["setup"]>["api"]>["guards"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const guardDef of guards?.handlers ?? []) {
    const coreCallback = result.createGuardCallback(guardDef.name);
    if (coreCallback) {
      await app.registerGuardHandler(
        guardDef.name,
        async (_err: Error | null, input: RuntimeGuardInput) => {
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
}

async function registerWebSocketHandlers(
  app: CoreRuntimeApplicationType,
  websocket: NonNullable<ReturnType<CoreRuntimeApplicationType["setup"]>["api"]>["websocket"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const def of websocket?.handlers ?? []) {
    const callback =
      result.createWebSocketCallback(def.route, def.name) ??
      (await result.createWebSocketCallbackById(def.handler, def.location, def.name));
    if (callback) {
      app.registerWebsocketHandler(def.route, callback);
    }
  }
}

async function registerConsumerHandlers(
  app: CoreRuntimeApplicationType,
  consumers: ReturnType<CoreRuntimeApplicationType["setup"]>["consumers"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const consumer of consumers?.consumers ?? []) {
    for (const def of consumer.handlers) {
      // def.handler is "module.ClassName.methodName" — extract the method name
      // for the registry lookup key that matches the scanner's tag format.
      const methodName = def.handler.split(".").pop() ?? def.name;
      const lookupKey = `${consumer.consumerName}::${methodName}`;
      const callback =
        result.createConsumerCallback(lookupKey, def.name) ??
        (await result.createConsumerCallbackById(def.handler, def.location, def.name));
      if (callback) {
        // Register with def.name (e.g. "userEventsConsumer_handle") — the Rust
        // runtime extracts the last `::` segment of the full source tag for its
        // handler HashMap lookup, so the registration key must match that segment.
        app.registerConsumerHandler(def.name, def.timeout, callback);
      }
    }
  }
}

async function registerEventHandlers(
  app: CoreRuntimeApplicationType,
  events: ReturnType<CoreRuntimeApplicationType["setup"]>["events"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const event of events?.events ?? []) {
    for (const def of event.handlers) {
      // Event consumers (datastore streams, bucket events) use the same
      // handler registration as queue/topic consumers — the Rust runtime
      // dispatches via the same registerConsumerHandler callback mechanism.
      const methodName = def.handler.split(".").pop() ?? def.name;
      const lookupKey = `${event.consumerName}::${methodName}`;
      const callback =
        result.createConsumerCallback(lookupKey, def.name) ??
        (await result.createConsumerCallbackById(def.handler, def.location, def.name));
      if (callback) {
        app.registerConsumerHandler(def.name, def.timeout, callback);
      }
    }
  }
}

async function registerScheduleHandlers(
  app: CoreRuntimeApplicationType,
  schedules: ReturnType<CoreRuntimeApplicationType["setup"]>["schedules"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const schedule of schedules?.schedules ?? []) {
    for (const def of schedule.handlers) {
      const methodName = def.handler.split(".").pop() ?? def.name;
      const lookupKey = `${schedule.scheduleId}::${methodName}`;
      const callback =
        result.createScheduleCallback(lookupKey, def.name) ??
        (await result.createScheduleCallbackById(def.handler, def.location, def.name));
      if (callback) {
        // Same as consumers — Rust runtime extracts last `::` segment for lookup.
        app.registerScheduleHandler(def.name, def.timeout, callback);
      }
    }
  }
}

async function registerCustomHandlers(
  app: CoreRuntimeApplicationType,
  customHandlers: ReturnType<CoreRuntimeApplicationType["setup"]>["customHandlers"],
  result: RuntimeBootstrapResult,
): Promise<void> {
  for (const def of customHandlers?.handlers ?? []) {
    const callback =
      result.createCustomCallback(def.name) ??
      (await result.createCustomCallbackById(def.handler, def.location, def.name));
    if (callback) {
      app.registerCustomHandler(def.name, def.timeout, callback);
    }
  }
}

/**
 * Full runtime lifecycle orchestrator.
 * Dynamically imports @celerity-sdk/runtime, loads config from CELERITY_* environment
 * variables, bootstraps the user's module, registers handler callbacks, and starts the server.
 */
export async function startRuntime(options?: StartRuntimeOptions): Promise<void> {
  const { app, appConfig } = await loadRuntime();
  const result = await bootstrapForRuntime();

  await registerHttpHandlers(app, appConfig.api, result);
  await registerGuardHandlers(app, appConfig.api?.guards, result);
  await registerWebSocketHandlers(app, appConfig.api?.websocket, result);
  await registerConsumerHandlers(app, appConfig.consumers, result);
  await registerEventHandlers(app, appConfig.events, result);
  await registerScheduleHandlers(app, appConfig.schedules, result);
  await registerCustomHandlers(app, appConfig.customHandlers, result);

  if (appConfig.api?.websocket) {
    const sender = new RuntimeWebSocketSender(app.websocketRegistry());
    result.container.register(WebSocketSender, { useValue: sender });
  }

  await app.run(options?.block ?? true);
}
