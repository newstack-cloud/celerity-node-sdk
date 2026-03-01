import type {
  ScheduleEventInput,
  ScheduleHandlerContext,
  EventResult,
  CelerityLayer,
  FunctionHandlerDefinition,
  Type,
  InjectionToken,
  Schema,
} from "@celerity-sdk/types";

export type ScheduleHandlerConfig<T = unknown> = {
  scheduleId?: string;
  schedule?: string;
  schema?: Schema<T>;
  inject?: InjectionToken[];
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  metadata?: Record<string, unknown>;
};

type ScheduleHandlerFn = (
  event: ScheduleEventInput,
  ctx: ScheduleHandlerContext,
  ...deps: unknown[]
) => Promise<EventResult>;

function isScheduleExpression(value: string): boolean {
  return value.startsWith("rate(") || value.startsWith("cron(");
}

/**
 * Creates a function-based schedule handler definition.
 *
 * Function handlers are blueprint-first — the schedule expression, timezone,
 * and handler binding are all defined in the blueprint. The handler declares
 * its dependencies and provides the task logic.
 *
 * @example
 * ```ts
 * // Minimal — blueprint defines everything
 * const dailyCleanup = createScheduleHandler(
 *   { inject: [CleanupService] },
 *   async (event, ctx, cleanupService: CleanupService) => {
 *     await cleanupService.run();
 *     return { success: true };
 *   },
 * );
 *
 * // With scheduleId hint for deploy engine auto-wiring
 * const weeklyReport = createScheduleHandler("weekly-report", {
 *   inject: [ReportService],
 * }, async (event, ctx, reportService: ReportService) => {
 *   await reportService.generate();
 *   return { success: true };
 * });
 *
 * // With expression for prototyping / single-environment apps
 * const hourlySync = createScheduleHandler("rate(1 hour)", {
 *   inject: [SyncService],
 * }, async (event, ctx, syncService: SyncService) => {
 *   await syncService.run();
 *   return { success: true };
 * });
 * ```
 */
export function createScheduleHandler(
  config: ScheduleHandlerConfig,
  handler: ScheduleHandlerFn,
): FunctionHandlerDefinition;
export function createScheduleHandler(
  scheduleIdOrExpression: string,
  config: ScheduleHandlerConfig,
  handler: ScheduleHandlerFn,
): FunctionHandlerDefinition;
export function createScheduleHandler(
  configOrString: string | ScheduleHandlerConfig,
  configOrHandler: ScheduleHandlerConfig | ScheduleHandlerFn,
  maybeHandler?: ScheduleHandlerFn,
): FunctionHandlerDefinition {
  let config: ScheduleHandlerConfig;
  let handler: ScheduleHandlerFn;

  if (typeof configOrString === "string") {
    config = { ...(configOrHandler as ScheduleHandlerConfig) };
    handler = maybeHandler!;
    if (isScheduleExpression(configOrString)) {
      config.schedule = configOrString;
    } else {
      config.scheduleId = configOrString;
    }
  } else {
    config = configOrString;
    handler = configOrHandler as ScheduleHandlerFn;
  }

  const metadata: Record<string, unknown> = {
    layers: config.layers ?? [],
    inject: config.inject ?? [],
    customMetadata: config.metadata ?? {},
  };

  if (config.scheduleId !== undefined) metadata.scheduleId = config.scheduleId;
  if (config.schedule !== undefined) metadata.schedule = config.schedule;
  if (config.schema !== undefined) metadata.schema = config.schema;

  return {
    __celerity_handler: true,
    type: "schedule",
    metadata,
    handler: handler as (...args: unknown[]) => unknown,
  };
}
