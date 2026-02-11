import { resolve } from "node:path";
import type {
  CelerityLayer,
  FunctionHandlerDefinition,
  InjectionToken,
  Type,
} from "@celerity-sdk/types";
import createDebug from "debug";
import type { HandlerRegistry } from "./registry";
import type { ResolvedHandler } from "./pipeline";

const debug = createDebug("celerity:core:module-resolver");

/**
 * Resolve a handler ID as a module reference by dynamically importing
 * the module and matching the exported function against the registry.
 *
 * Resolution strategy:
 * 1. If the ID contains a dot, try splitting at the last dot into
 *    `moduleName.exportName` (named export).
 * 2. Fallback: treat the full ID as a module name with a default export.
 *    This handles no-dot refs (e.g. "myModule") and dotted module names
 *    (e.g. "app.module" from app.module.js) where the named export split failed.
 *
 * Supported formats:
 * - `"handlers.hello"` — named export `hello` from module `handlers`
 * - `"handlers"` — default export from module `handlers`
 * - `"app.module"` — dotted module name: tries named export split first,
 *   falls back to default export from module `app.module`
 */
export async function resolveHandlerByModuleRef(
  handlerId: string,
  registry: HandlerRegistry,
  baseDir: string,
): Promise<ResolvedHandler | null> {
  const lastDot = handlerId.lastIndexOf(".");
  if (lastDot > 0) {
    const moduleName = handlerId.slice(0, lastDot);
    const exportName = handlerId.slice(lastDot + 1);
    const result = await tryResolveExport(baseDir, moduleName, exportName, handlerId, registry);
    if (result) return result;
  }

  return tryResolveExport(baseDir, handlerId, "default", handlerId, registry);
}

async function tryResolveExport(
  baseDir: string,
  moduleName: string,
  exportName: string,
  handlerId: string,
  registry: HandlerRegistry,
): Promise<ResolvedHandler | null> {
  const handlerModulePath = resolve(baseDir, moduleName);

  let mod: Record<string, unknown>;
  try {
    mod = (await import(handlerModulePath)) as Record<string, unknown>;
  } catch {
    try {
      mod = (await import(`${handlerModulePath}.js`)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const exported = mod[exportName];
  if (!exported) return null;

  const isFnDef =
    typeof exported === "object" &&
    exported !== null &&
    (exported as Record<string, unknown>).__celerity_handler;
  const handlerFn = isFnDef ? (exported as FunctionHandlerDefinition).handler : exported;
  if (typeof handlerFn !== "function") return null;

  // Handler functions created with createHttpHandler are registered in the HandlerRegistry
  // without an ID. The module import uses the shared Node.js module cache,
  // so we can find the same function reference in the registry and match it
  // with the handler ID derived from the module path + export name.
  // This is primarily used when routing information is defined in a blueprint
  // and the handler function in code has no route information, as is common
  // in serverless application development.
  const match = registry.getAllHandlers().find((h) => h.handlerFn === handlerFn);
  if (match) {
    match.id = handlerId;
    debug("matched '%s' to registry handler", handlerId);
    return match;
  }

  debug("'%s' not in registry, wrapping directly", handlerId);
  return buildResolvedFromExport(handlerId, handlerFn, isFnDef ? exported : null);
}

function buildResolvedFromExport(
  handlerId: string,
  handlerFn: unknown,
  fnDef: unknown,
): ResolvedHandler {
  if (fnDef) {
    const meta = (fnDef as FunctionHandlerDefinition).metadata as {
      layers?: (CelerityLayer | Type<CelerityLayer>)[];
      inject?: InjectionToken[];
      customMetadata?: Record<string, unknown>;
    };
    return {
      id: handlerId,
      protectedBy: [],
      layers: [...(meta.layers ?? [])],
      isPublic: false,
      paramMetadata: [],
      customMetadata: meta.customMetadata ?? {},
      handlerFn: handlerFn as (...args: unknown[]) => unknown,
      isFunctionHandler: true,
      injectTokens: meta.inject ?? [],
    };
  }

  return {
    id: handlerId,
    protectedBy: [],
    layers: [],
    isPublic: false,
    paramMetadata: [],
    customMetadata: {},
    handlerFn: handlerFn as (...args: unknown[]) => unknown,
    isFunctionHandler: true,
    injectTokens: [],
  };
}
