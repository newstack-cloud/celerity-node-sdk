import "reflect-metadata";
import type { Type } from "@celerity-sdk/types";
import { isRuntimeProvidedToken } from "@celerity-sdk/common";
import { buildModuleGraph, getClassDependencyTokens } from "@celerity-sdk/core";

/**
 * Parsed resource token info extracted from a Symbol description
 * like "celerity:datastore:usersDatastore".
 */
export type ResourceTokenInfo = {
  token: symbol;
  type: string; // "datastore", "topic", "queue", "cache", "bucket", "sqlDatabase", "config"
  name: string; // "usersDatastore", "userEventsTopic", etc.
};

/**
 * Walks the module graph for the given root module and extracts all resource
 * layer tokens from provider, controller, and guard constructor parameters.
 *
 * This discovers which resources the module (and its imports) depend on
 * without instantiating anything.
 */
export function discoverResourceTokens(rootModule: Type): ResourceTokenInfo[] {
  const graph = buildModuleGraph(rootModule);
  const seen = new Set<symbol>();
  const result: ResourceTokenInfo[] = [];

  for (const [, node] of graph) {
    const classes: Type[] = [
      ...node.controllers,
      ...node.guards.filter((g): g is Type => typeof g === "function"),
    ];

    for (const provider of node.providers) {
      if (typeof provider === "function") {
        classes.push(provider);
      } else if ("useClass" in provider) {
        classes.push((provider as { useClass: Type }).useClass);
      }
    }

    for (const cls of classes) {
      const depTokens = getClassDependencyTokens(cls);
      for (const dep of depTokens) {
        if (typeof dep !== "symbol") continue;
        if (!isRuntimeProvidedToken(dep)) continue;
        if (seen.has(dep)) continue;
        seen.add(dep);

        const parsed = parseResourceToken(dep);
        if (parsed) {
          result.push(parsed);
        }
      }
    }
  }

  return result;
}

/**
 * Parse a resource token symbol like Symbol.for("celerity:datastore:usersDatastore")
 * into its type and name components.
 */
function parseResourceToken(token: symbol): ResourceTokenInfo | null {
  const desc = token.description;
  if (!desc) return null;

  // Format: "celerity:<type>:<name>"
  const parts = desc.split(":");
  if (parts.length < 3 || parts[0] !== "celerity") return null;

  return {
    token,
    type: parts[1],
    name: parts.slice(2).join(":"), // handle names with colons (unlikely but safe)
  };
}
