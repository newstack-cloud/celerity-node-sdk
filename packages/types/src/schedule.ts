import type { BaseHandlerContext } from "./handler";

/** Input provided to a schedule handler. */
export type ScheduleEventInput = {
  handlerTag: string;
  scheduleId: string;
  messageId: string;
  schedule: string;
  input?: unknown;
  vendor: unknown;
  traceContext?: Record<string, string> | null;
};

/** Context for schedule event handlers. */
export type ScheduleHandlerContext = BaseHandlerContext & {
  event: ScheduleEventInput;
};
