// Constructor type for DI
export type Type<T = unknown> = {
  new (...args: unknown[]): T;
};

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
  useFactory: (...args: unknown[]) => T | Promise<T>;
  inject?: InjectionToken[];
  onClose?: (value: T) => Promise<void> | void;
};

export type ValueProvider<T = unknown> = {
  useValue: T;
  onClose?: (value: T) => Promise<void> | void;
};

export type Provider<T = unknown> = ClassProvider<T> | FactoryProvider<T> | ValueProvider<T>;

export type NextFunction = () => Promise<void>;
