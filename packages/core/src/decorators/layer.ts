import "reflect-metadata";
import type { Type, CelerityLayer } from "@celerity-sdk/types";
import { LAYER_METADATA } from "../metadata/constants";

export function UseLayer(...layers: (Type<CelerityLayer> | CelerityLayer)[]) {
  return (
    target: object,
    propertyKey?: string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void => {
    if (propertyKey) {
      const existing: (Type<CelerityLayer> | CelerityLayer)[] =
        Reflect.getOwnMetadata(LAYER_METADATA, target, propertyKey) ?? [];
      Reflect.defineMetadata(LAYER_METADATA, [...layers, ...existing], target, propertyKey);
    } else {
      const existing: (Type<CelerityLayer> | CelerityLayer)[] =
        Reflect.getOwnMetadata(LAYER_METADATA, target) ?? [];
      Reflect.defineMetadata(LAYER_METADATA, [...layers, ...existing], target);
    }
  };
}

export function UseLayers(layers: (Type<CelerityLayer> | CelerityLayer)[]) {
  return UseLayer(...layers);
}
