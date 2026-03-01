import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Invoke } from "../../src/decorators/invoke";
import { INVOKE_METADATA } from "../../src/metadata/constants";
import type { InvokeMetadata } from "../../src/decorators/invoke";

describe("@Invoke()", () => {
  it("sets INVOKE_METADATA on the method", () => {
    class Handlers {
      @Invoke("processPayment")
      process() {}
    }

    const meta: InvokeMetadata = Reflect.getOwnMetadata(
      INVOKE_METADATA,
      Handlers.prototype,
      "process",
    );
    expect(meta).toBeDefined();
    expect(meta.name).toBe("processPayment");
  });

  it("stores different names on different methods", () => {
    class Handlers {
      @Invoke("taskA")
      a() {}

      @Invoke("taskB")
      b() {}
    }

    const metaA: InvokeMetadata = Reflect.getOwnMetadata(
      INVOKE_METADATA,
      Handlers.prototype,
      "a",
    );
    const metaB: InvokeMetadata = Reflect.getOwnMetadata(
      INVOKE_METADATA,
      Handlers.prototype,
      "b",
    );

    expect(metaA.name).toBe("taskA");
    expect(metaB.name).toBe("taskB");
  });

  it("does not set metadata on methods without @Invoke", () => {
    class Handlers {
      @Invoke("onlyThis")
      decorated() {}

      plain() {}
    }

    const meta = Reflect.getOwnMetadata(INVOKE_METADATA, Handlers.prototype, "plain");
    expect(meta).toBeUndefined();
  });
});
