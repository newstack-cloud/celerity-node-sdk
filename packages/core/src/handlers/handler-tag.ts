/**
 * The key a class-based consumer or schedule handler is registered under in the
 * handler registry, and the value a deploy target has to stamp on the function
 * for the adapter to find it again.
 */
export function composeHandlerTag(source: string | undefined, methodName: string): string {
  return source ? `${source}::${methodName}` : methodName;
}
