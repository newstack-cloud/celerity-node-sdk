import { describe, it, expect } from "vitest";
import {
  deriveClassResourceName,
  deriveClassHandlerName,
  deriveClassHandlerFunction,
  deriveFunctionResourceName,
  deriveFunctionHandlerFunction,
  deriveCodeLocation,
} from "../../src/extract/identity";

describe("deriveClassResourceName", () => {
  it("converts class name to camelCase and appends method name", () => {
    expect(deriveClassResourceName("OrdersHandler", "getOrder")).toBe("ordersHandler_getOrder");
  });

  it("handles single-char class names", () => {
    expect(deriveClassResourceName("A", "run")).toBe("a_run");
  });
});

describe("deriveClassHandlerName", () => {
  it("joins class and method with a hyphen", () => {
    expect(deriveClassHandlerName("OrdersHandler", "getOrder")).toBe("OrdersHandler-getOrder");
  });
});

describe("deriveClassHandlerFunction", () => {
  it("derives handler function from source file, class, and method", () => {
    expect(
      deriveClassHandlerFunction("src/handlers/orders.ts", "OrdersHandler", "getOrder"),
    ).toBe("orders.OrdersHandler.getOrder");
  });

  it("strips the file extension", () => {
    expect(
      deriveClassHandlerFunction("dist/orders.module.js", "Handler", "list"),
    ).toBe("orders.module.Handler.list");
  });
});

describe("deriveFunctionResourceName", () => {
  it("returns the export name as-is", () => {
    expect(deriveFunctionResourceName("getOrder")).toBe("getOrder");
  });
});

describe("deriveFunctionHandlerFunction", () => {
  it("derives handler function from source file and export name", () => {
    expect(deriveFunctionHandlerFunction("src/handlers/orders.ts", "getOrder")).toBe(
      "orders.getOrder",
    );
  });
});

describe("deriveCodeLocation", () => {
  it("derives relative directory with ./ prefix", () => {
    expect(deriveCodeLocation("/project/src/handlers/orders.ts", "/project")).toBe(
      "./src/handlers",
    );
  });

  it("returns ./ for files at project root", () => {
    expect(deriveCodeLocation("/project/app.ts", "/project")).toBe("./");
  });

  it("handles nested directories", () => {
    expect(deriveCodeLocation("/project/src/api/v1/orders.ts", "/project")).toBe("./src/api/v1");
  });
});
