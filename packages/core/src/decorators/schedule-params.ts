import "reflect-metadata";
import type { Schema } from "@celerity-sdk/types";
import { PARAM_METADATA } from "../metadata/constants";
import type { ParamMetadata } from "./params";

function createScheduleParamDecorator(
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
 * Injects the schedule event's `input` payload into a `@ScheduleHandler()`
 * method parameter.
 *
 * - **Without a schema:** injects the raw `event.input` as `unknown`.
 * - **With a schema:** the pipeline validates `event.input` through
 *   `schema.parse()` before the handler runs. If validation fails, the
 *   handler is not invoked and the pipeline returns
 *   `{ success: false, errorMessage }`.
 *
 * @param schema - Optional Zod-compatible schema (`{ parse(data): T }`) for
 *   input validation.
 */
export function ScheduleInput(schema?: Schema): ParameterDecorator {
  return createScheduleParamDecorator("scheduleInput", schema);
}

/**
 * Injects the schedule ID from the event into a `@ScheduleHandler()`
 * method parameter. This is the identifier of the schedule rule that
 * triggered the handler (e.g. `"daily-cleanup"`).
 */
export function ScheduleId(): ParameterDecorator {
  return createScheduleParamDecorator("scheduleId");
}

/**
 * Injects the schedule expression from the event into a `@ScheduleHandler()`
 * method parameter. This is the actual schedule expression that triggered
 * the handler (e.g. `"rate(1 day)"` or `"cron(0 9 * * *)"`).
 */
export function ScheduleExpression(): ParameterDecorator {
  return createScheduleParamDecorator("scheduleExpression");
}

/**
 * Injects the full `ScheduleEventInput` envelope into a `@ScheduleHandler()`
 * method parameter. This includes the schedule ID, expression, message ID,
 * input payload, vendor metadata, and trace context.
 *
 * Use this when you need access to the entire event beyond just the input —
 * analogous to `@Req()` for HTTP handlers or `@EventInput()` for consumers.
 */
export function ScheduleEventInput(): ParameterDecorator {
  return createScheduleParamDecorator("scheduleEvent");
}
