import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { ScheduleHandler } from "../../src/decorators/schedule";
import { SCHEDULE_HANDLER_METADATA } from "../../src/metadata/constants";
import type { ScheduleHandlerMetadata } from "../../src/decorators/schedule";

describe("@ScheduleHandler()", () => {
  it("sets SCHEDULE_HANDLER_METADATA on the method", () => {
    class Tasks {
      @ScheduleHandler()
      cleanup() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "cleanup",
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual({});
  });

  it("parses a plain string as scheduleId", () => {
    class Tasks {
      @ScheduleHandler("daily-cleanup")
      cleanup() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "cleanup",
    );
    expect(meta.scheduleId).toBe("daily-cleanup");
    expect(meta).not.toHaveProperty("schedule");
  });

  it("parses a rate() string as schedule expression", () => {
    class Tasks {
      @ScheduleHandler("rate(1 day)")
      cleanup() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "cleanup",
    );
    expect(meta.schedule).toBe("rate(1 day)");
    expect(meta).not.toHaveProperty("scheduleId");
  });

  it("parses a cron() string as schedule expression", () => {
    class Tasks {
      @ScheduleHandler("cron(0 9 * * *)")
      report() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "report",
    );
    expect(meta.schedule).toBe("cron(0 9 * * *)");
    expect(meta).not.toHaveProperty("scheduleId");
  });

  it("accepts an explicit options object with both fields", () => {
    class Tasks {
      @ScheduleHandler({ scheduleId: "weekly-report", schedule: "cron(0 9 ? * MON *)" })
      report() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "report",
    );
    expect(meta.scheduleId).toBe("weekly-report");
    expect(meta.schedule).toBe("cron(0 9 ? * MON *)");
  });

  it("accepts an options object with only scheduleId", () => {
    class Tasks {
      @ScheduleHandler({ scheduleId: "my-task" })
      task() {}
    }

    const meta: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "task",
    );
    expect(meta.scheduleId).toBe("my-task");
    expect(meta).not.toHaveProperty("schedule");
  });

  it("sets metadata independently on different methods", () => {
    class Tasks {
      @ScheduleHandler("task-a")
      taskA() {}

      @ScheduleHandler("rate(5 minutes)")
      taskB() {}
    }

    const metaA: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "taskA",
    );
    const metaB: ScheduleHandlerMetadata = Reflect.getOwnMetadata(
      SCHEDULE_HANDLER_METADATA,
      Tasks.prototype,
      "taskB",
    );

    expect(metaA.scheduleId).toBe("task-a");
    expect(metaB.schedule).toBe("rate(5 minutes)");
  });
});
