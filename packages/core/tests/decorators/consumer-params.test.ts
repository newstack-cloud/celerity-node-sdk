import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  Messages,
  EventInput,
  Vendor,
  ConsumerTraceContext,
} from "../../src/decorators/consumer-params";
import { PARAM_METADATA } from "../../src/metadata/constants";
import type { ParamMetadata } from "../../src/decorators/params";

function getParamMetadata(target: object, methodName: string): ParamMetadata[] {
  return Reflect.getOwnMetadata(PARAM_METADATA, target, methodName) ?? [];
}

describe("Consumer parameter decorators", () => {
  it("@Messages() stores messages param metadata without schema", () => {
    class TestConsumer {
      process(@Messages() _messages: unknown[]) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("messages");
    expect(meta[0].schema).toBeUndefined();
  });

  it("@Messages(schema) stores messages param metadata with schema", () => {
    const schema = { parse: (data: unknown) => data as string };
    class TestConsumer {
      process(@Messages(schema) _messages: unknown[]) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("messages");
    expect(meta[0].schema).toBe(schema);
  });

  it("@EventInput() stores consumerEvent param metadata", () => {
    class TestConsumer {
      process(@EventInput() _event: unknown) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "consumerEvent" });
  });

  it("@Vendor() stores consumerVendor param metadata", () => {
    class TestConsumer {
      process(@Vendor() _vendor: unknown) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "consumerVendor" });
  });

  it("@ConsumerTraceContext() stores consumerTraceContext param metadata", () => {
    class TestConsumer {
      process(@ConsumerTraceContext() _trace: unknown) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "consumerTraceContext" });
  });

  it("multiple param decorators on a single method accumulate", () => {
    class TestConsumer {
      process(
        @Messages() _messages: unknown[],
        @EventInput() _event: unknown,
        @Vendor() _vendor: unknown,
        @ConsumerTraceContext() _trace: unknown,
      ) {}
    }

    const meta = getParamMetadata(TestConsumer.prototype, "process");
    expect(meta).toHaveLength(4);
    const types = meta.map((m) => m.type);
    expect(types).toContain("messages");
    expect(types).toContain("consumerEvent");
    expect(types).toContain("consumerVendor");
    expect(types).toContain("consumerTraceContext");
  });
});
