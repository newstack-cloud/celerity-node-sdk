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

/**
 * Registers an HTTP GET handler. The method should return `HandlerResponse`.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 *   Uses `{param}` format for path parameters.
 */
export function Get(path?: string): MethodDecorator {
  return createMethodDecorator("GET", path);
}

/**
 * Registers an HTTP POST handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Post(path?: string): MethodDecorator {
  return createMethodDecorator("POST", path);
}

/**
 * Registers an HTTP PUT handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Put(path?: string): MethodDecorator {
  return createMethodDecorator("PUT", path);
}

/**
 * Registers an HTTP PATCH handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Patch(path?: string): MethodDecorator {
  return createMethodDecorator("PATCH", path);
}

/**
 * Registers an HTTP DELETE handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Delete(path?: string): MethodDecorator {
  return createMethodDecorator("DELETE", path);
}

/**
 * Registers an HTTP HEAD handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Head(path?: string): MethodDecorator {
  return createMethodDecorator("HEAD", path);
}

/**
 * Registers an HTTP OPTIONS handler.
 *
 * @param path - Route path relative to the controller prefix. Defaults to `/`.
 */
export function Options(path?: string): MethodDecorator {
  return createMethodDecorator("OPTIONS", path);
}
