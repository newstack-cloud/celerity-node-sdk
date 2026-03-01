import { resolve } from "node:path";
import type {
  CelerityLayer,
  FunctionHandlerDefinition,
  HandlerType,
  HttpMethod,
  InjectionToken,
  Type,
} from "@celerity-sdk/types";
import createDebug from "debug";
import type { HandlerRegistry } from "./registry";
import type { ResolvedHandler } from "./types";

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
  handlerType: HandlerType,
  registry: HandlerRegistry,
  baseDir: string,
): Promise<ResolvedHandler | null> {
  const lastDot = handlerId.lastIndexOf(".");
  if (lastDot > 0) {
    const moduleName = handlerId.slice(0, lastDot);
    const exportName = handlerId.slice(lastDot + 1);
    const result = await tryResolveExport(
      baseDir,
      moduleName,
      exportName,
      handlerId,
      handlerType,
      registry,
    );
    if (result) return result;
  }

  return tryResolveExport(baseDir, handlerId, "default", handlerId, handlerType, registry);
}

async function tryResolveExport(
  baseDir: string,
  moduleName: string,
  exportName: string,
  handlerId: string,
  handlerType: HandlerType,
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

  // Type mismatch guard: if the export declares a handler type that
  // doesn't match the requested type, skip it.
  // Plain function exports (no __celerity_handler) skip this check
  // since they are truly blueprint-first with no declared type.
  if (isFnDef && (exported as FunctionHandlerDefinition).type !== handlerType) {
    return null;
  }

  const handlerFn = isFnDef ? (exported as FunctionHandlerDefinition).handler : exported;
  if (typeof handlerFn !== "function") return null;

  // Handler functions created with create*Handler are registered in the
  // HandlerRegistry without an ID. The module import uses the shared
  // Node.js module cache, so we can find the same function reference
  // in the registry and match it with the handler ID.
  const handlers = registry.getHandlersByType(handlerType);
  const match = handlers.find((h) => h.handlerFn === handlerFn);
  if (match) {
    match.id = handlerId;
    debug("matched '%s' to registry handler", handlerId);
    return match;
  }

  debug("'%s' not in registry, wrapping directly", handlerId);
  return buildResolvedFromExport(handlerId, handlerType, handlerFn, isFnDef ? exported : null);
}

type FnDefMetadata = {
  layers?: (CelerityLayer | Type<CelerityLayer>)[];
  inject?: InjectionToken[];
  customMetadata?: Record<string, unknown>;
  path?: string;
  method?: HttpMethod;
  route?: string;
  scheduleId?: string;
  name?: string;
};

function buildResolvedFromExport(
  handlerId: string,
  handlerType: HandlerType,
  handlerFn: unknown,
  fnDef: unknown,
): ResolvedHandler {
  const meta = fnDef ? ((fnDef as FunctionHandlerDefinition).metadata as FnDefMetadata) : null;

  const base = {
    id: handlerId,
    layers: [...(meta?.layers ?? [])],
    paramMetadata: [] as [],
    customMetadata: meta?.customMetadata ?? {},
    handlerFn: handlerFn as (...args: unknown[]) => unknown,
    isFunctionHandler: true,
    injectTokens: meta?.inject ?? [],
  };

  const guardFields = { protectedBy: [] as string[], isPublic: false };

  switch (handlerType) {
    case "http":
      return {
        ...base,
        ...guardFields,
        type: "http",
        ...(meta?.path !== undefined ? { path: meta.path } : {}),
        ...(meta?.method !== undefined ? { method: meta.method } : {}),
      };
    case "websocket":
      return { ...base, ...guardFields, type: "websocket", route: meta?.route ?? handlerId };
    case "consumer":
      return { ...base, type: "consumer", handlerTag: meta?.route ?? handlerId };
    case "schedule":
      return { ...base, type: "schedule", handlerTag: meta?.scheduleId ?? handlerId };
    case "custom":
      return { ...base, type: "custom", name: meta?.name ?? handlerId };
  }
}
