import "reflect-metadata";
import type { Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";
import type { ParamMetadata } from "./params";

function createInvokeParamDecorator(
  type: ParamMetadata["type"],
  schema?: Schema,
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (!propertyKey) return;

    const existing: ParamMetadata[] =
      Reflect.getOwnMetadata(PARAM_METADATA, target, propertyKey) ?? [];

    const meta: ParamMetadata = { index: parameterIndex, type };
    if (schema) meta.schema = schema;

    existing.push(meta);
    Reflect.defineMetadata(PARAM_METADATA, existing, target, propertyKey);
  };
}

/**
 * Injects the invocation payload into an `@Invoke()` method parameter.
 *
 * - **Without a schema:** injects the raw payload as `unknown`. The handler
 *   is responsible for any validation.
 * - **With a schema:** the pipeline validates the payload through
 *   `schema.parse()` before the handler runs. If validation fails, the
 *   error is re-thrown to the caller.
 *
 * @param schema - Optional Zod-compatible schema (`{ parse(data): T }`) for
 *   payload validation.
 */
export function Payload(schema?: Schema): ParameterDecorator {
  return createInvokeParamDecorator("payload", schema);
}

/**
 * Injects the `BaseHandlerContext` into an `@Invoke()` method parameter.
 * Provides access to the handler metadata store, DI container, and
 * optional request-scoped logger.
 */
export function InvokeContext(): ParameterDecorator {
  return createInvokeParamDecorator("invokeContext");
}
