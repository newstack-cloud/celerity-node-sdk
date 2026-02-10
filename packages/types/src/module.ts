import type { Type, InjectionToken, Provider } from "./common";

export type FunctionHandlerDefinition = {
  __celerity_handler: true;
  type: "http" | "consumer" | "schedule" | "websocket";
  metadata: Record<string, unknown>;
  handler: (...args: unknown[]) => unknown;
};

export type ModuleMetadata = {
  controllers?: Type[];
  functionHandlers?: FunctionHandlerDefinition[];
  providers?: (Type | (Provider & { provide: InjectionToken }))[];
  imports?: Type[];
  exports?: InjectionToken[];
};
