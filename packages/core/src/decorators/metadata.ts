import "reflect-metadata";
import { CUSTOM_METADATA } from "../metadata/constants";

export function SetMetadata(key: string, value: unknown) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: Record<string, unknown> =
        Reflect.getOwnMetadata(CUSTOM_METADATA, target, propertyKey) ?? {};
      Reflect.defineMetadata(CUSTOM_METADATA, { ...existing, [key]: value }, target, propertyKey);
    } else {
      const existing: Record<string, unknown> =
        Reflect.getOwnMetadata(CUSTOM_METADATA, target) ?? {};
      Reflect.defineMetadata(CUSTOM_METADATA, { ...existing, [key]: value }, target);
    }
  };
}

export function Action(value: unknown) {
  return SetMetadata("action", value);
}
