import "reflect-metadata";
import type { HttpMethod } from "@celerity-sdk/types";
import { HTTP_METHOD_METADATA, ROUTE_PATH_METADATA } from "../metadata/constants";

function createMethodDecorator(method: HttpMethod, path = "/"): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(HTTP_METHOD_METADATA, method, target, propertyKey);
    Reflect.defineMetadata(ROUTE_PATH_METADATA, path, target, propertyKey);
    return descriptor;
  };
}

export function Get(path?: string): MethodDecorator {
  return createMethodDecorator("GET", path);
}

export function Post(path?: string): MethodDecorator {
  return createMethodDecorator("POST", path);
}

export function Put(path?: string): MethodDecorator {
  return createMethodDecorator("PUT", path);
}

export function Patch(path?: string): MethodDecorator {
  return createMethodDecorator("PATCH", path);
}

export function Delete(path?: string): MethodDecorator {
  return createMethodDecorator("DELETE", path);
}

export function Head(path?: string): MethodDecorator {
  return createMethodDecorator("HEAD", path);
}

export function Options(path?: string): MethodDecorator {
  return createMethodDecorator("OPTIONS", path);
}
