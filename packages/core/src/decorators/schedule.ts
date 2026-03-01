import "reflect-metadata";
import { SCHEDULE_HANDLER_METADATA } from "../metadata/constants";

export type ScheduleHandlerMetadata = {
  scheduleId?: string;
  schedule?: string;
};

type ScheduleHandlerOptions = {
  scheduleId?: string;
  schedule?: string;
};

function isScheduleExpression(value: string): boolean {
  return value.startsWith("rate(") || value.startsWith("cron(");
}

function parseScheduleArg(arg: string | ScheduleHandlerOptions): ScheduleHandlerMetadata {
  if (typeof arg === "string") {
    return isScheduleExpression(arg) ? { schedule: arg } : { scheduleId: arg };
  }
  const meta: ScheduleHandlerMetadata = {};
  if (arg.scheduleId !== undefined) meta.scheduleId = arg.scheduleId;
  if (arg.schedule !== undefined) meta.schedule = arg.schedule;
  return meta;
}

/**
 * Marks a method as a schedule handler — a task triggered by a time-based
 * schedule (EventBridge rule, Cloud Scheduler, etc.).
 *
 * This is a **cross-cutting** method decorator that works on any controller
 * type (`@Controller`, `@WebSocketController`, `@Consumer`). There is no
 * `@ScheduleController` class decorator — schedule-only classes use
 * `@Controller()`.
 *
 * The method should return `Promise<EventResult>` to report success/failure.
 *
 * @param arg - Optional string or options object. String parsing:
 *   - No args → fully blueprint-driven (no annotations)
 *   - String with `rate(` or `cron(` prefix → `schedule` expression annotation
 *   - String without prefix → `scheduleId` annotation hint for deploy engine
 *   - Object → explicit `{ scheduleId?, schedule? }`
 *
 * @example
 * ```ts
 * @Controller()
 * class MaintenanceTasks {
 *   @ScheduleHandler("daily-cleanup")
 *   async cleanup(@ScheduleInput() input: unknown): Promise<EventResult> {
 *     // scheduleId hint — blueprint defines the actual schedule
 *   }
 *
 *   @ScheduleHandler("rate(1 day)")
 *   async sync(): Promise<EventResult> {
 *     // schedule expression annotation — blueprint can override
 *   }
 *
 *   @ScheduleHandler({ scheduleId: "weekly-report", schedule: "cron(0 9 ? * MON *)" })
 *   async report(): Promise<EventResult> {
 *     // explicit object with both fields
 *   }
 * }
 * ```
 */
export function ScheduleHandler(): MethodDecorator;
export function ScheduleHandler(scheduleIdOrExpression: string): MethodDecorator;
export function ScheduleHandler(options: ScheduleHandlerOptions): MethodDecorator;
export function ScheduleHandler(arg?: string | ScheduleHandlerOptions): MethodDecorator {
  return (target, propertyKey) => {
    const meta: ScheduleHandlerMetadata = arg ? parseScheduleArg(arg) : {};
    Reflect.defineMetadata(SCHEDULE_HANDLER_METADATA, meta, target, propertyKey);
  };
}
