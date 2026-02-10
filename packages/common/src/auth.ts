/**
 * Extract a user identifier from the auth context.
 *
 * Auth context is a guard-name-keyed map, e.g.:
 *   { jwt: { claims: { sub: "user-42", ... } }, customGuard: { userId: "104932" } }
 *
 * Walks all guard results looking for the first string match in priority order:
 *   1. claims.sub  (standard JWT — jwt guard wraps claims in a "claims" key)
 *   2. sub         (custom guard returning standard OIDC claims directly)
 *   3. userId      (common custom guard convention)
 *   4. user_id     (snake_case variant)
 */
export function extractUserId(auth: Record<string, unknown> | null): string | undefined {
  if (!auth) return undefined;

  for (const guardResult of Object.values(auth)) {
    if (typeof guardResult !== "object" || guardResult === null) continue;
    const g = guardResult as Record<string, unknown>;

    // JWT guard: { claims: { sub: "..." } }
    if (typeof g.claims === "object" && g.claims !== null) {
      const claims = g.claims as Record<string, unknown>;
      if (isStringOrNumber(claims.sub)) return String(claims.sub);
    }

    // Direct sub / userId / user_id on the guard result
    if (isStringOrNumber(g.sub)) return String(g.sub);
    if (isStringOrNumber(g.userId)) return String(g.userId);
    if (isStringOrNumber(g.user_id)) return String(g.user_id);
  }

  return undefined;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
