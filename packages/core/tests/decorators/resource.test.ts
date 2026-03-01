import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { UseResource, UseResources } from "../../src/decorators/resource";
import { USE_RESOURCE_METADATA } from "../../src/metadata/constants";

// ---------------------------------------------------------------------------
// @UseResource — class-level
// ---------------------------------------------------------------------------

describe("@UseResource (class-level)", () => {
  it("should store a single resource ref on the class", () => {
    @UseResource("ordersBucket")
    class Handler {
      handle() {}
    }

    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(refs).toEqual(["ordersBucket"]);
  });

  it("should store multiple variadic args on the class", () => {
    @UseResource("ordersBucket", "ordersQueue")
    class Handler {
      handle() {}
    }

    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(refs).toEqual(["ordersBucket", "ordersQueue"]);
  });

  it("should accumulate multiple @UseResource decorators in declaration order", () => {
    @UseResource("ordersBucket")
    @UseResource("ordersQueue")
    class Handler {
      handle() {}
    }

    // Declaration order: ordersBucket first, ordersQueue second
    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(refs).toEqual(["ordersBucket", "ordersQueue"]);
  });

  it("should not have resource metadata on an undecorated class", () => {
    class PlainHandler {
      handle() {}
    }

    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, PlainHandler);
    expect(refs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @UseResource — method-level
// ---------------------------------------------------------------------------

describe("@UseResource (method-level)", () => {
  it("should store resource refs on a specific method", () => {
    class Handler {
      @UseResource("ordersBucket")
      getOrder() {}

      listOrders() {}
    }

    const refs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "getOrder",
    );
    expect(refs).toEqual(["ordersBucket"]);
  });

  it("should not have resource metadata on undecorated methods", () => {
    class Handler {
      @UseResource("ordersBucket")
      getOrder() {}

      listOrders() {}
    }

    const refs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "listOrders",
    );
    expect(refs).toBeUndefined();
  });

  it("should accumulate multiple @UseResource decorators on a method in declaration order", () => {
    class Handler {
      @UseResource("ordersBucket")
      @UseResource("ordersCache")
      getOrder() {}
    }

    const refs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "getOrder",
    );
    expect(refs).toEqual(["ordersBucket", "ordersCache"]);
  });

  it("should store variadic args on a method", () => {
    class Handler {
      @UseResource("ordersBucket", "ordersCache")
      getOrder() {}
    }

    const refs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "getOrder",
    );
    expect(refs).toEqual(["ordersBucket", "ordersCache"]);
  });
});

// ---------------------------------------------------------------------------
// @UseResource — class + method coexistence
// ---------------------------------------------------------------------------

describe("@UseResource (class + method coexistence)", () => {
  it("should allow class-level and method-level to coexist independently", () => {
    @UseResource("ordersBucket")
    class Handler {
      @UseResource("ordersCache")
      getOrder() {}

      listOrders() {}
    }

    // Class-level metadata
    const classRefs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(classRefs).toEqual(["ordersBucket"]);

    // Method-level metadata — independent of class-level
    const methodRefs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "getOrder",
    );
    expect(methodRefs).toEqual(["ordersCache"]);

    // Undecorated method — no metadata
    const listRefs = Reflect.getOwnMetadata(
      USE_RESOURCE_METADATA,
      Handler.prototype,
      "listOrders",
    );
    expect(listRefs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @UseResources — array-based alias
// ---------------------------------------------------------------------------

describe("@UseResources", () => {
  it("should delegate to @UseResource with array arg", () => {
    @UseResources(["ordersBucket", "ordersQueue"])
    class Handler {
      handle() {}
    }

    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(refs).toEqual(["ordersBucket", "ordersQueue"]);
  });

  it("should accumulate with @UseResource on the same target", () => {
    @UseResource("ordersCache")
    @UseResources(["ordersBucket", "ordersQueue"])
    class Handler {
      handle() {}
    }

    // Declaration order: ordersCache first, then ordersBucket and ordersQueue
    const refs = Reflect.getOwnMetadata(USE_RESOURCE_METADATA, Handler);
    expect(refs).toEqual(["ordersCache", "ordersBucket", "ordersQueue"]);
  });
});
