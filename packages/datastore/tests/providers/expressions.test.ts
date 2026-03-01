import { describe, it, expect } from "vitest";
import {
  buildKeyConditionExpression,
  buildFilterExpression,
} from "../../src/providers/dynamodb/expressions";

describe("buildKeyConditionExpression", () => {
  it("builds a key-only expression", () => {
    const result = buildKeyConditionExpression({ name: "pk", value: "user-1" });

    expect(result.expression).toBe("#k0 = :k0");
    expect(result.names).toEqual({ "#k0": "pk" });
    expect(result.values).toEqual({ ":k0": "user-1" });
  });

  it("builds key + range eq expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "eq", value: "profile" },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 = :k1");
    expect(result.names).toEqual({ "#k0": "pk", "#k1": "sk" });
    expect(result.values).toEqual({ ":k0": "user-1", ":k1": "profile" });
  });

  it("builds range key lt expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "lt", value: 100 },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 < :k1");
  });

  it("builds range key le expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "le", value: 100 },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 <= :k1");
  });

  it("builds range key gt expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "gt", value: 50 },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 > :k1");
  });

  it("builds range key ge expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "ge", value: 50 },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 >= :k1");
  });

  it("builds range key between expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "between", low: "A", high: "Z" },
    );

    expect(result.expression).toBe("#k0 = :k0 AND #k1 BETWEEN :k1a AND :k1b");
    expect(result.values).toEqual({ ":k0": "user-1", ":k1a": "A", ":k1b": "Z" });
  });

  it("builds range key begins_with expression", () => {
    const result = buildKeyConditionExpression(
      { name: "pk", value: "user-1" },
      { name: "sk", operator: "startsWith", value: "order-" },
    );

    expect(result.expression).toBe("#k0 = :k0 AND begins_with(#k1, :k1)");
    expect(result.values).toEqual({ ":k0": "user-1", ":k1": "order-" });
  });

  it("supports numeric key values", () => {
    const result = buildKeyConditionExpression({ name: "id", value: 42 });

    expect(result.values).toEqual({ ":k0": 42 });
  });
});

describe("buildFilterExpression", () => {
  it("builds a single eq condition", () => {
    const result = buildFilterExpression({ name: "status", operator: "eq", value: "active" });

    expect(result.expression).toBe("#f0 = :f0");
    expect(result.names).toEqual({ "#f0": "status" });
    expect(result.values).toEqual({ ":f0": "active" });
  });

  it("builds a single ne condition", () => {
    const result = buildFilterExpression({ name: "status", operator: "ne", value: "deleted" });

    expect(result.expression).toBe("#f0 <> :f0");
  });

  it("builds comparison operator conditions", () => {
    expect(
      buildFilterExpression({ name: "age", operator: "lt", value: 30 }).expression,
    ).toBe("#f0 < :f0");

    expect(
      buildFilterExpression({ name: "age", operator: "le", value: 30 }).expression,
    ).toBe("#f0 <= :f0");

    expect(
      buildFilterExpression({ name: "age", operator: "gt", value: 18 }).expression,
    ).toBe("#f0 > :f0");

    expect(
      buildFilterExpression({ name: "age", operator: "ge", value: 18 }).expression,
    ).toBe("#f0 >= :f0");
  });

  it("builds a between condition", () => {
    const result = buildFilterExpression({
      name: "score",
      operator: "between",
      low: 10,
      high: 100,
    });

    expect(result.expression).toBe("#f0 BETWEEN :f0a AND :f0b");
    expect(result.values).toEqual({ ":f0a": 10, ":f0b": 100 });
  });

  it("builds a startsWith condition", () => {
    const result = buildFilterExpression({
      name: "email",
      operator: "startsWith",
      value: "admin",
    });

    expect(result.expression).toBe("begins_with(#f0, :f0)");
    expect(result.values).toEqual({ ":f0": "admin" });
  });

  it("builds a contains condition", () => {
    const result = buildFilterExpression({
      name: "tags",
      operator: "contains",
      value: "premium",
    });

    expect(result.expression).toBe("contains(#f0, :f0)");
    expect(result.values).toEqual({ ":f0": "premium" });
  });

  it("builds an exists condition with no values", () => {
    const result = buildFilterExpression({ name: "email", operator: "exists" });

    expect(result.expression).toBe("attribute_exists(#f0)");
    expect(result.names).toEqual({ "#f0": "email" });
    expect(result.values).toEqual({});
  });

  it("ANDs multiple conditions together", () => {
    const result = buildFilterExpression([
      { name: "status", operator: "eq", value: "active" },
      { name: "age", operator: "gt", value: 18 },
      { name: "email", operator: "exists" },
    ]);

    expect(result.expression).toBe("#f0 = :f0 AND #f1 > :f1 AND attribute_exists(#f2)");
    expect(result.names).toEqual({ "#f0": "status", "#f1": "age", "#f2": "email" });
    expect(result.values).toEqual({ ":f0": "active", ":f1": 18 });
  });

  it("handles a single condition (not in array) correctly", () => {
    const result = buildFilterExpression({ name: "x", operator: "eq", value: 1 });

    expect(result.expression).toBe("#f0 = :f0");
  });

  it("uses f-prefixed placeholders that don't collide with k-prefixed key placeholders", () => {
    const keyResult = buildKeyConditionExpression({ name: "pk", value: "a" });
    const filterResult = buildFilterExpression({ name: "status", operator: "eq", value: "ok" });

    const allNames = { ...keyResult.names, ...filterResult.names };
    const allValues = { ...keyResult.values, ...filterResult.values };

    // No key collisions
    expect(Object.keys(allNames)).toHaveLength(2);
    expect(Object.keys(allValues)).toHaveLength(2);
  });
});
