import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  ScheduleInput,
  ScheduleId,
  ScheduleExpression,
  ScheduleEventInput,
} from "../../src/decorators/schedule-params";
import { PARAM_METADATA } from "../../src/metadata/constants";
import type { ParamMetadata } from "../../src/decorators/params";

function getParamMetadata(target: object, methodName: string): ParamMetadata[] {
  return Reflect.getOwnMetadata(PARAM_METADATA, target, methodName) ?? [];
}

describe("Schedule parameter decorators", () => {
  it("@ScheduleInput() stores scheduleInput param metadata without schema", () => {
    class Tasks {
      run(@ScheduleInput() _input: unknown) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("scheduleInput");
    expect(meta[0].schema).toBeUndefined();
  });

  it("@ScheduleInput(schema) stores scheduleInput param metadata with schema", () => {
    const schema = { parse: (data: unknown) => data as string };
    class Tasks {
      run(@ScheduleInput(schema) _input: unknown) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("scheduleInput");
    expect(meta[0].schema).toBe(schema);
  });

  it("@ScheduleId() stores scheduleId param metadata", () => {
    class Tasks {
      run(@ScheduleId() _id: unknown) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "scheduleId" });
  });

  it("@ScheduleExpression() stores scheduleExpression param metadata", () => {
    class Tasks {
      run(@ScheduleExpression() _expr: unknown) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "scheduleExpression" });
  });

  it("@ScheduleEventInput() stores scheduleEvent param metadata", () => {
    class Tasks {
      run(@ScheduleEventInput() _event: unknown) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "scheduleEvent" });
  });

  it("multiple param decorators on a single method accumulate", () => {
    class Tasks {
      run(
        @ScheduleInput() _input: unknown,
        @ScheduleId() _id: unknown,
        @ScheduleExpression() _expr: unknown,
        @ScheduleEventInput() _event: unknown,
      ) {}
    }

    const meta = getParamMetadata(Tasks.prototype, "run");
    expect(meta).toHaveLength(4);
    const types = meta.map((m) => m.type);
    expect(types).toContain("scheduleInput");
    expect(types).toContain("scheduleId");
    expect(types).toContain("scheduleExpression");
    expect(types).toContain("scheduleEvent");
  });
});
