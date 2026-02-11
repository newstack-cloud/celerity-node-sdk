import { basename, dirname, relative } from "node:path";

/**
 * Derives a resource name for a class-based handler method.
 * Format: camelCase(className) + "_" + methodName
 *
 * @example deriveClassResourceName("OrdersHandler", "getOrder") => "ordersHandler_getOrder"
 */
export function deriveClassResourceName(className: string, methodName: string): string {
  const camelClass = className.charAt(0).toLowerCase() + className.slice(1);
  return `${camelClass}_${methodName}`;
}

/**
 * Derives a handler name for a class-based handler method.
 * Format: className + "-" + methodName
 *
 * @example deriveClassHandlerName("OrdersHandler", "getOrder") => "OrdersHandler-getOrder"
 */
export function deriveClassHandlerName(className: string, methodName: string): string {
  return `${className}-${methodName}`;
}

/**
 * Derives the handler function reference for a class-based handler.
 * Format: moduleBaseName + "." + className + "." + methodName
 *
 * @example deriveClassHandlerFunction("src/handlers/orders.ts", "OrdersHandler", "getOrder")
 *          => "orders.OrdersHandler.getOrder"
 */
export function deriveClassHandlerFunction(
  sourceFile: string,
  className: string,
  methodName: string,
): string {
  const base = basename(sourceFile).replace(/\.[^.]+$/, "");
  return `${base}.${className}.${methodName}`;
}

/**
 * Derives a resource name for a function-based handler.
 * Uses the export name directly.
 *
 * @example deriveFunctionResourceName("getOrder") => "getOrder"
 */
export function deriveFunctionResourceName(exportName: string): string {
  return exportName;
}

/**
 * Derives the handler function reference for a function-based handler.
 * Format: moduleBaseName + "." + exportName
 *
 * @example deriveFunctionHandlerFunction("src/handlers/orders.ts", "getOrder")
 *          => "orders.getOrder"
 */
export function deriveFunctionHandlerFunction(sourceFile: string, exportName: string): string {
  const base = basename(sourceFile).replace(/\.[^.]+$/, "");
  return `${base}.${exportName}`;
}

/**
 * Derives the code location from a source file path relative to the project root.
 * Returns the directory prefixed with "./"
 *
 * @example deriveCodeLocation("src/handlers/orders.ts", "/project") => "./src/handlers"
 */
export function deriveCodeLocation(sourceFile: string, projectRoot: string): string {
  const rel = relative(projectRoot, sourceFile);
  const dir = dirname(rel);
  return dir === "." ? "./" : `./${dir}`;
}
