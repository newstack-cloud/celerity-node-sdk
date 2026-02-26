import type { Type, InjectionToken, Provider } from "./common";

export type FunctionHandlerDefinition = {
  __celerity_handler: true;
  id?: string;
  type: "http" | "consumer" | "schedule" | "websocket" | "workflow" | "custom";
  metadata: Record<string, unknown>;
  handler: (...args: unknown[]) => unknown;
};

export type GuardDefinition = {
  __celerity_guard: true;
  name?: string;
  handler: (...args: unknown[]) => unknown;
  metadata?: Record<string, unknown>;
};

export type ModuleMetadata = {
  controllers?: Type[];
  functionHandlers?: FunctionHandlerDefinition[];
  guards?: (Type | GuardDefinition)[];
  providers?: (Type | (Provider & { provide: InjectionToken }))[];
  imports?: Type[];
  exports?: InjectionToken[];
};
