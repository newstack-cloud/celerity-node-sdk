import type { InjectionToken, Provider } from "./common";

/** Minimal DI container contract for layer and handler access. */
export interface ServiceContainer {
  resolve<T>(token: InjectionToken): Promise<T>;
  register<T>(token: InjectionToken, provider: Provider<T>): void;
  has(token: InjectionToken): boolean;
  closeAll(): Promise<void>;
}
