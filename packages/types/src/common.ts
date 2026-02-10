// Constructor type for DI — uses `any[]` for constructor params because
// TypeScript's contravariance rejects typed constructors against `unknown[]`.
// This matches Angular/NestJS convention; DI resolves actual types at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Type<T = unknown> = new (...args: any[]) => T;

// Token for dependency injection — class reference, string, or symbol
export type InjectionToken = string | symbol | Type;

// Service cleanup contract for container-managed services
export interface Closeable {
  close(): Promise<void> | void;
}

// Provider registration for DI container
export type ClassProvider<T = unknown> = {
  useClass: Type<T>;
  onClose?: (value: T) => Promise<void> | void;
};

export type FactoryProvider<T = unknown> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => T | Promise<T>;
  inject?: InjectionToken[];
  onClose?: (value: T) => Promise<void> | void;
};

export type ValueProvider<T = unknown> = {
  useValue: T;
  onClose?: (value: T) => Promise<void> | void;
};

export type Provider<T = unknown> = ClassProvider<T> | FactoryProvider<T> | ValueProvider<T>;
