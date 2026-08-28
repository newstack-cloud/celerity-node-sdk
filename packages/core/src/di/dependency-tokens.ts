import "reflect-metadata";
import type {
  Type,
  InjectionToken,
  Provider,
  ClassProvider,
  FactoryProvider,
} from "@celerity-sdk/types";
import { INJECT_METADATA } from "../metadata/constants";

function isClassProvider<T>(p: Provider<T>): p is ClassProvider<T> {
  return "useClass" in p;
}

function isFactoryProvider<T>(p: Provider<T>): p is FactoryProvider<T> {
  return "useFactory" in p;
}

/**
 * Reads reflect-metadata to determine the constructor dependency tokens for a class.
 * Applies @Inject() overrides where present.
 *
 * The parameter count comes from `design:paramtypes` where available and from
 * the explicit @Inject() indices otherwise. Both are needed because
 * `emitDecoratorMetadata` is a TypeScript compiler feature that esbuild does
 * not implement, so under esbuild-based tooling (tsx among them)
 * `design:paramtypes` is absent no matter what tsconfig requests. Deriving the
 * count from paramtypes alone silently reports every class as having no
 * dependencies there.
 *
 * A position with neither an @Inject() token nor an emitted paramtype cannot be
 * resolved, so it is omitted rather than reported as undefined.
 */
export function getClassDependencyTokens(target: Type): InjectionToken[] {
  const paramTypes: Type[] = Reflect.getMetadata("design:paramtypes", target) ?? [];
  const injectOverrides: Map<number, InjectionToken> =
    Reflect.getMetadata(INJECT_METADATA, target) ?? new Map();

  const highestInjectIndex = injectOverrides.size > 0 ? Math.max(...injectOverrides.keys()) : -1;
  const parameterCount = Math.max(paramTypes.length, highestInjectIndex + 1);

  const tokens: InjectionToken[] = [];
  for (let index = 0; index < parameterCount; index += 1) {
    const token = injectOverrides.get(index) ?? paramTypes[index];
    if (token !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Determines the dependency tokens for a provider (class, factory, or value).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getProviderDependencyTokens(provider: Provider<any>): InjectionToken[] {
  if (isClassProvider(provider)) {
    return getClassDependencyTokens(provider.useClass);
  }
  if (isFactoryProvider(provider) && provider.inject) {
    return [...provider.inject];
  }
  return [];
}
