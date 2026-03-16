import { describe, it, expect, vi } from "vitest";
import { createScheduleHandler } from "../../src/functions/create-schedule-handler";

describe("createScheduleHandler", () => {
  const handler = vi.fn(async () => ({ success: true }));

  it("returns a FunctionHandlerDefinition with type 'schedule'", () => {
    const def = createScheduleHandler({}, handler);
    expect(def.__celerity_handler).toBe(true);
    expect(def.type).toBe("schedule");
    expect(def.handler).toBe(handler);
  });

  it("stores source from config", () => {
    const def = createScheduleHandler({ source: "dailyCleanup" }, handler);
    expect(def.metadata.source).toBe("dailyCleanup");
  });

  it("stores schedule expression from config", () => {
    const def = createScheduleHandler({ schedule: "rate(1 day)" }, handler);
    expect(def.metadata.schedule).toBe("rate(1 day)");
  });

  it("stores schema in metadata", () => {
    const schema = { parse: (data: unknown) => data };
    const def = createScheduleHandler({ schema }, handler);
    expect(def.metadata.schema).toBe(schema);
  });

  it("stores inject tokens in metadata", () => {
    const TOKEN = Symbol("TOKEN");
    const def = createScheduleHandler({ inject: [TOKEN] }, handler);
    expect(def.metadata.inject).toEqual([TOKEN]);
  });

  it("stores custom metadata", () => {
    const def = createScheduleHandler({ metadata: { foo: "bar" } }, handler);
    expect(def.metadata.customMetadata).toEqual({ foo: "bar" });
  });

  it("defaults inject/layers/customMetadata to empty", () => {
    const def = createScheduleHandler({}, handler);
    expect(def.metadata.inject).toEqual([]);
    expect(def.metadata.layers).toEqual([]);
    expect(def.metadata.customMetadata).toEqual({});
  });

  // Overloaded call patterns with string first argument
  describe("string first argument", () => {
    it("parses a plain string as source", () => {
      const def = createScheduleHandler("dailyCleanup", {}, handler);
      expect(def.metadata.source).toBe("dailyCleanup");
      expect(def.metadata.schedule).toBeUndefined();
    });

    it("parses a rate() string as schedule expression", () => {
      const def = createScheduleHandler("rate(1 day)", {}, handler);
      expect(def.metadata.schedule).toBe("rate(1 day)");
      expect(def.metadata.source).toBeUndefined();
    });

    it("parses a cron() string as schedule expression", () => {
      const def = createScheduleHandler("cron(0 9 * * *)", {}, handler);
      expect(def.metadata.schedule).toBe("cron(0 9 * * *)");
    });

    it("merges string argument with config options", () => {
      const schema = { parse: (data: unknown) => data };
      const def = createScheduleHandler("weeklyReport", { schema }, handler);
      expect(def.metadata.source).toBe("weeklyReport");
      expect(def.metadata.schema).toBe(schema);
    });
  });
});
