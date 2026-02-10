import { resolve } from "node:path";
import type { Type } from "@celerity-sdk/types";

/** Discover and dynamically import the user's root module. */
export async function discoverModule(modulePath?: string): Promise<Type> {
  const resolved = modulePath ?? process.env.CELERITY_MODULE_PATH;
  if (!resolved) {
    throw new Error(
      "Cannot discover module: set CELERITY_MODULE_PATH environment variable or pass modulePath",
    );
  }

  const absolutePath = resolve(resolved);
  const imported = (await import(absolutePath)) as Record<string, unknown>;
  const rootModule = imported.default ?? findModuleExport(imported);

  if (!rootModule || typeof rootModule !== "function") {
    throw new Error(`No module class found in "${resolved}"`);
  }

  return rootModule as Type;
}

function findModuleExport(imported: Record<string, unknown>): unknown {
  for (const key of Object.keys(imported)) {
    if (key === "default") continue;
    if (typeof imported[key] === "function") {
      return imported[key];
    }
  }
  return undefined;
}
