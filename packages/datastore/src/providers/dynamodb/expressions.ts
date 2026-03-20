import type {
  Condition,
  KeyCondition,
  RangeCondition,
  ConditionExpression,
  AndGroup,
  OrGroup,
} from "../../types";

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

type MutableCounter = { value: number };

/**
 * Builds a DynamoDB FilterExpression (or ConditionExpression for writes)
 * from a condition expression tree. Supports single conditions, arrays of
 * conditions (implicit AND), and explicit AND/OR groups with recursive nesting.
 * Uses `#f`/`:f` prefixed placeholders to avoid collision with key placeholders.
 */
export function buildFilterExpression(conditions: ConditionExpression): ExpressionResult {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const counter: MutableCounter = { value: 0 };

  const expression = buildExpressionNode(conditions, names, values, counter, 0);
  return { expression, names, values };
}

function buildExpressionNode(
  expr: ConditionExpression,
  names: Record<string, string>,
  values: Record<string, unknown>,
  counter: MutableCounter,
  depth: number,
): string {
  if (Array.isArray(expr)) {
    return buildGroup(expr, "AND", names, values, counter, depth);
  }
  if (isOrGroup(expr)) {
    return buildGroup(expr.or, "OR", names, values, counter, depth);
  }
  if (isAndGroup(expr)) {
    return buildGroup(expr.and, "AND", names, values, counter, depth);
  }
  return buildSingleCondition(expr, names, values, counter);
}

function buildGroup(
  children: ConditionExpression[],
  operator: "AND" | "OR",
  names: Record<string, string>,
  values: Record<string, unknown>,
  counter: MutableCounter,
  depth: number,
): string {
  const parts = children.map((child) =>
    buildExpressionNode(child, names, values, counter, depth + 1),
  );

  if (parts.length === 1) return parts[0];

  const joined = parts.join(` ${operator} `);
  return depth > 0 ? `(${joined})` : joined;
}

function buildSingleCondition(
  cond: Condition,
  names: Record<string, string>,
  values: Record<string, unknown>,
  counter: MutableCounter,
): string {
  const i = counter.value;
  const attrName = `#f${i}`;
  names[attrName] = cond.name;
  counter.value++;

  switch (cond.operator) {
    case "eq":
    case "ne":
    case "lt":
    case "le":
    case "gt":
    case "ge": {
      const valKey = `:f${i}`;
      values[valKey] = cond.value;
      return `${attrName} ${COMPARISON_OPERATORS[cond.operator]} ${valKey}`;
    }
    case "between": {
      const lowVal = `:f${i}a`;
      const highVal = `:f${i}b`;
      values[lowVal] = cond.low;
      values[highVal] = cond.high;
      return `${attrName} BETWEEN ${lowVal} AND ${highVal}`;
    }
    case "startsWith":
    case "contains": {
      const valKey = `:f${i}`;
      values[valKey] = cond.value;
      const fnName = cond.operator === "startsWith" ? "begins_with" : "contains";
      return `${fnName}(${attrName}, ${valKey})`;
    }
    case "exists":
      return `attribute_exists(${attrName})`;
  }
}

function isAndGroup(expr: ConditionExpression): expr is AndGroup {
  return typeof expr === "object" && !Array.isArray(expr) && "and" in expr;
}

function isOrGroup(expr: ConditionExpression): expr is OrGroup {
  return typeof expr === "object" && !Array.isArray(expr) && "or" in expr;
}
