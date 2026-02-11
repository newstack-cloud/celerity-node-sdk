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
 * Pure function — reads metadata only, no container side effects.
 */
export function getClassDependencyTokens(target: Type): InjectionToken[] {
  const paramTypes: Type[] = Reflect.getMetadata("design:paramtypes", target) ?? [];
  const injectOverrides: Map<number, InjectionToken> =
    Reflect.getMetadata(INJECT_METADATA, target) ?? new Map();
  return paramTypes.map((paramType, index) => injectOverrides.get(index) ?? paramType);
}

/**
 * Determines the dependency tokens for a provider (class, factory, or value).
 *
 * Pure function — reads metadata only, no container side effects.
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
