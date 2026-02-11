import "reflect-metadata";
import createDebug from "debug";
import type {
  Type,
  InjectionToken,
  Provider,
  ClassProvider,
  FactoryProvider,
  ValueProvider,
  ServiceContainer,
} from "@celerity-sdk/types";
import { INJECTABLE_METADATA } from "../metadata/constants";
import { getClassDependencyTokens, getProviderDependencyTokens } from "./dependency-tokens";

const debug = createDebug("celerity:core:di");

type CloseEntry = {
  token: InjectionToken;
  close: () => Promise<void> | void;
};

const CLOSE_METHODS = ["close", "end", "quit", "disconnect", "$disconnect", "destroy"] as const;

function isClassProvider<T>(p: Provider<T>): p is ClassProvider<T> {
  return "useClass" in p;
}

function isFactoryProvider<T>(p: Provider<T>): p is FactoryProvider<T> {
  return "useFactory" in p;
}

function isValueProvider<T>(p: Provider<T>): p is ValueProvider<T> {
  return "useValue" in p;
}

export function tokenToString(token: InjectionToken): string {
  if (typeof token === "function") return token.name;
  return String(token);
}

function detectCloseMethod(value: unknown): (() => Promise<void> | void) | null {
  if (typeof value !== "object" || value === null) return null;

  const obj = value as Record<string, unknown>;
  for (const method of CLOSE_METHODS) {
    if (typeof obj[method] === "function") {
      return () => (obj[method] as () => Promise<void> | void)();
    }
  }

  return null;
}

// Used for the internal map of providers where we can't track each specific
// Provider<T> type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProvider = Provider<any>;

export class Container implements ServiceContainer {
  private providers = new Map<InjectionToken, AnyProvider>();
  private instances = new Map<InjectionToken, unknown>();
  private resolving = new Set<InjectionToken>();
  private edges = new Map<InjectionToken, Set<InjectionToken>>();
  private closeStack: CloseEntry[] = [];
  private trackedTokens = new Set<InjectionToken>();

  register<T>(token: InjectionToken, provider: Provider<T>): void {
    const type = isClassProvider(provider)
      ? "class"
      : isFactoryProvider(provider)
        ? "factory"
        : "value";
    debug("register %s (%s)", tokenToString(token), type);
    this.providers.set(token, provider);

    if (isValueProvider(provider)) {
      this.trackCloseable(token, provider.useValue, provider.onClose);
    }
  }

  registerClass<T>(target: Type<T>): void {
    debug("register %s (class)", target.name);
    this.providers.set(target, { useClass: target });
  }

  registerValue<T>(token: InjectionToken, value: T): void {
    debug("registerValue %s", tokenToString(token));
    this.instances.set(token, value);
    this.trackCloseable(token, value);
  }

  async resolve<T>(token: InjectionToken): Promise<T> {
    const name = tokenToString(token);
    if (this.instances.has(token)) {
      debug("resolve %s → cached", name);
      return this.instances.get(token) as T;
    }

    if (this.resolving.has(token)) {
      const path = [...this.resolving, token].map(tokenToString).join(" → ");
      throw new Error(`Circular dependency detected: ${path}`);
    }

    debug("resolve %s → constructing", name);
    this.resolving.add(token);
    try {
      const provider = this.providers.get(token);
      if (!provider) {
        if (typeof token === "function") {
          return this.constructClass(token as Type<T>);
        }
        throw new Error(
          `No provider registered for ${tokenToString(token)}.\n` +
            'Ensure the module providing it is included in your module\'s "imports" array,\n' +
            "or register a provider for it directly.",
        );
      }

      if (isFactoryProvider(provider) && provider.inject) {
        this.recordEdges(token, provider.inject);
      }

      const instance = await this.createFromProvider<T>(provider);
      this.instances.set(token, instance);

      if (!isValueProvider(provider)) {
        this.trackCloseable(token, instance, provider.onClose);
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  async resolveClass<T>(target: Type<T>): Promise<T> {
    if (this.instances.has(target)) {
      return this.instances.get(target) as T;
    }

    if (this.resolving.has(target)) {
      const path = [...this.resolving, target].map(tokenToString).join(" → ");
      throw new Error(`Circular dependency detected: ${path}`);
    }

    this.resolving.add(target);
    try {
      return this.constructClass(target);
    } finally {
      this.resolving.delete(target);
    }
  }

  has(token: InjectionToken): boolean {
    return this.instances.has(token) || this.providers.has(token);
  }

  getDependencies(token: InjectionToken): ReadonlySet<InjectionToken> {
    return this.edges.get(token) ?? new Set();
  }

  async closeAll(): Promise<void> {
    debug("closeAll: %d resources", this.closeStack.length);
    const entries = [...this.closeStack].reverse();
    for (const entry of entries) {
      try {
        debug("closing %s", tokenToString(entry.token));
        await entry.close();
      } catch {
        // Close failure is non-fatal — continue closing remaining services.
      }
    }
    this.closeStack = [];
    this.trackedTokens.clear();
  }

  /**
   * Validates that all registered providers have resolvable dependencies.
   * Call after all module providers are registered but before resolution.
   * Throws a descriptive error listing ALL missing dependencies at once.
   */
  validateDependencies(): void {
    const missing: Array<{ consumer: string; dependency: string }> = [];
    const visited = new Set<InjectionToken>();

    const walk = (token: InjectionToken): void => {
      if (visited.has(token)) return;
      visited.add(token);

      let depTokens: InjectionToken[];
      const provider = this.providers.get(token);

      if (provider) {
        depTokens = this.getProviderDependencyTokens(provider);
      } else if (typeof token === "function") {
        depTokens = this.getClassDependencyTokens(token as Type);
      } else {
        return;
      }

      for (const dep of depTokens) {
        if (this.providers.has(dep) || this.instances.has(dep)) {
          walk(dep);
        } else if (typeof dep === "function") {
          walk(dep);
        } else {
          missing.push({
            consumer: tokenToString(token),
            dependency: tokenToString(dep),
          });
        }
      }
    };

    for (const token of this.providers.keys()) {
      walk(token);
    }

    if (missing.length > 0) {
      const details = missing
        .map(
          ({ consumer, dependency }) =>
            `  ${consumer} requires ${dependency} — no provider registered`,
        )
        .join("\n");
      throw new Error(
        `Unresolvable dependencies detected during bootstrap:\n\n${details}\n\n` +
          "For each unresolved dependency, check that the module providing it is included\n" +
          'in your root module\'s "imports" array, or register a provider for it directly.',
      );
    }
  }

  getClassDependencyTokens(target: Type): InjectionToken[] {
    return getClassDependencyTokens(target);
  }

  getProviderDependencyTokens(provider: AnyProvider): InjectionToken[] {
    return getProviderDependencyTokens(provider);
  }

  /**
   * Constructs a class by resolving constructor dependencies via design:paramtypes.
   * Does NOT manage the resolving set — callers (resolve/resolveClass) own cycle detection.
   */
  private async constructClass<T>(target: Type<T>): Promise<T> {
    if (this.instances.has(target)) {
      return this.instances.get(target) as T;
    }

    const isInjectable = Reflect.getOwnMetadata(INJECTABLE_METADATA, target) === true;
    if (!isInjectable && target.length > 0) {
      throw new Error(
        `Class ${target.name} has constructor parameters but is not decorated with @Injectable(). ` +
          "Add @Injectable() to enable dependency injection, or use a factory provider.",
      );
    }

    const depTokens = this.getClassDependencyTokens(target);
    debug("construct %s deps=[%s]", target.name, depTokens.map(tokenToString).join(", "));
    this.recordEdges(target, depTokens);

    const deps: unknown[] = [];
    for (const t of depTokens) {
      deps.push(await this.resolve(t));
    }

    const instance = new target(...deps) as T;
    this.instances.set(target, instance);
    this.trackCloseable(target, instance);
    return instance;
  }

  private recordEdges(from: InjectionToken, to: InjectionToken[]): void {
    let set = this.edges.get(from);
    if (!set) {
      set = new Set();
      this.edges.set(from, set);
    }
    for (const dep of to) {
      set.add(dep);
    }
  }

  private trackCloseable<T>(
    token: InjectionToken,
    value: T,
    onClose?: (value: T) => Promise<void> | void,
  ): void {
    if (this.trackedTokens.has(token)) return;

    if (onClose) {
      this.closeStack.push({ token, close: () => onClose(value) });
      this.trackedTokens.add(token);
      return;
    }

    const closeFn = detectCloseMethod(value);
    if (closeFn) {
      this.closeStack.push({ token, close: closeFn });
      this.trackedTokens.add(token);
    }
  }

  private async createFromProvider<T>(provider: AnyProvider): Promise<T> {
    if (isValueProvider(provider)) {
      return provider.useValue as T;
    }

    if (isClassProvider(provider)) {
      return this.constructClass(provider.useClass) as Promise<T>;
    }

    if (isFactoryProvider(provider)) {
      const deps = provider.inject
        ? await Promise.all(provider.inject.map((t) => this.resolve(t)))
        : [];
      return provider.useFactory(...deps) as T;
    }

    throw new Error("Invalid provider configuration");
  }
}
