import "reflect-metadata";
import type { InjectionToken } from "@celerity-sdk/types";
import { INJECTABLE_METADATA, INJECT_METADATA } from "../metadata/constants";

export function Injectable(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existing: Map<number, InjectionToken> =
      Reflect.getOwnMetadata(INJECT_METADATA, target) ?? new Map();
    existing.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_METADATA, existing, target);
  };
}
