import type { KeyCondition, RangeCondition, ConditionExpression } from "../../types";

export type ExpressionResult = {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
};

const COMPARISON_OPERATORS = {
  eq: "=",
  ne: "<>",
  lt: "<",
  le: "<=",
  gt: ">",
  ge: ">=",
} as const;

/**
 * Builds a DynamoDB KeyConditionExpression from a key condition and optional range condition.
 * Uses `#k`/`:k` prefixed placeholders to avoid collision with filter placeholders.
 */
export function buildKeyConditionExpression(
  key: KeyCondition,
  range?: RangeCondition,
): ExpressionResult {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  let counter = 0;

  const pkName = `#k${counter}`;
  const pkValue = `:k${counter}`;
  names[pkName] = key.name;
  values[pkValue] = key.value;
  counter++;

  let expression = `${pkName} = ${pkValue}`;

  if (range) {
    const skName = `#k${counter}`;
    names[skName] = range.name;

    switch (range.operator) {
      case "eq":
      case "lt":
      case "le":
      case "gt":
      case "ge": {
        const skValue = `:k${counter}`;
        values[skValue] = range.value;
        expression += ` AND ${skName} ${COMPARISON_OPERATORS[range.operator]} ${skValue}`;
        break;
      }
      case "between": {
        const lowVal = `:k${counter}a`;
        const highVal = `:k${counter}b`;
        values[lowVal] = range.low;
        values[highVal] = range.high;
        expression += ` AND ${skName} BETWEEN ${lowVal} AND ${highVal}`;
        break;
      }
      case "startsWith": {
        const skValue = `:k${counter}`;
        values[skValue] = range.value;
        expression += ` AND begins_with(${skName}, ${skValue})`;
        break;
      }
    }
  }

  return { expression, names, values };
}

/**
 * Builds a DynamoDB FilterExpression (or ConditionExpression for writes)
 * from one or more Condition objects. Conditions are AND'd together.
 * Uses `#f`/`:f` prefixed placeholders to avoid collision with key placeholders.
 */
export function buildFilterExpression(conditions: ConditionExpression): ExpressionResult {
  const condArray = Array.isArray(conditions) ? conditions : [conditions];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const parts: string[] = [];
  let counter = 0;

  for (const cond of condArray) {
    const attrName = `#f${counter}`;
    names[attrName] = cond.name;

    switch (cond.operator) {
      case "eq":
      case "ne":
      case "lt":
      case "le":
      case "gt":
      case "ge": {
        const valKey = `:f${counter}`;
        values[valKey] = cond.value;
        parts.push(`${attrName} ${COMPARISON_OPERATORS[cond.operator]} ${valKey}`);
        break;
      }
      case "between": {
        const lowVal = `:f${counter}a`;
        const highVal = `:f${counter}b`;
        values[lowVal] = cond.low;
        values[highVal] = cond.high;
        parts.push(`${attrName} BETWEEN ${lowVal} AND ${highVal}`);
        break;
      }
      case "startsWith":
      case "contains": {
        const valKey = `:f${counter}`;
        values[valKey] = cond.value;
        const fnName = cond.operator === "startsWith" ? "begins_with" : "contains";
        parts.push(`${fnName}(${attrName}, ${valKey})`);
        break;
      }
      case "exists":
        parts.push(`attribute_exists(${attrName})`);
        break;
    }

    counter++;
  }

  return { expression: parts.join(" AND "), names, values };
}
