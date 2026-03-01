import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Payload, InvokeContext } from "../../src/decorators/invoke-params";
import { PARAM_METADATA } from "../../src/metadata/constants";
import type { ParamMetadata } from "../../src/decorators/params";

function getParamMetadata(target: object, methodName: string): ParamMetadata[] {
  return Reflect.getOwnMetadata(PARAM_METADATA, target, methodName) ?? [];
}

describe("Invoke parameter decorators", () => {
  it("@Payload() stores payload param metadata without schema", () => {
    class Handlers {
      process(@Payload() _payload: unknown) {}
    }

    const meta = getParamMetadata(Handlers.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("payload");
    expect(meta[0].schema).toBeUndefined();
  });

  it("@Payload(schema) stores payload param metadata with schema", () => {
    const schema = { parse: (data: unknown) => data as string };
    class Handlers {
      process(@Payload(schema) _payload: unknown) {}
    }

    const meta = getParamMetadata(Handlers.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0].type).toBe("payload");
    expect(meta[0].schema).toBe(schema);
  });

  it("@InvokeContext() stores invokeContext param metadata", () => {
    class Handlers {
      process(@InvokeContext() _ctx: unknown) {}
    }

    const meta = getParamMetadata(Handlers.prototype, "process");
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual({ index: 0, type: "invokeContext" });
  });

  it("multiple param decorators on a single method accumulate", () => {
    class Handlers {
      process(
        @Payload() _payload: unknown,
        @InvokeContext() _ctx: unknown,
      ) {}
    }

    const meta = getParamMetadata(Handlers.prototype, "process");
    expect(meta).toHaveLength(2);
    const types = meta.map((m) => m.type);
    expect(types).toContain("payload");
    expect(types).toContain("invokeContext");
  });
});
