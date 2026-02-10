import "reflect-metadata";
import { CONTROLLER_METADATA, INJECTABLE_METADATA } from "../metadata/constants";

export type ControllerMetadata = {
  prefix?: string;
};

export function Controller(prefix?: string): ClassDecorator {
  return (target) => {
    const metadata: ControllerMetadata = {};
    if (prefix !== undefined) {
      metadata.prefix = prefix;
    }
    Reflect.defineMetadata(CONTROLLER_METADATA, metadata, target);
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
  };
}
