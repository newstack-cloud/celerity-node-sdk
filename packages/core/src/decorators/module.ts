import "reflect-metadata";
import type { ModuleMetadata } from "@celerity-sdk/types";
import { MODULE_METADATA } from "../metadata/constants";

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_METADATA, metadata, target);
  };
}
