#!/usr/bin/env node

import { resolve } from "node:path";
import { buildScannedModule, validateScannedDependencies } from "./metadata-app";
import { serializeManifest } from "./serializer";
import type { Type } from "@celerity-sdk/types";

interface CliArgs {
  module: string;
  projectRoot: string;
}

function parseArgs(argv: string[]): CliArgs {
  let modulePath: string | undefined;
  let projectRoot: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--module" && i + 1 < argv.length) {
      modulePath = argv[++i];
    } else if (arg === "--project-root" && i + 1 < argv.length) {
      projectRoot = argv[++i];
    }
  }

  if (!modulePath) {
    throw new Error("Missing required argument: --module <path>");
  }

  return {
    module: resolve(modulePath),
    projectRoot: projectRoot ? resolve(projectRoot) : process.cwd(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Dynamically import the user's compiled module
  const imported = (await import(args.module)) as Record<string, unknown>;

  // Look for the root module class — prefer default export, fall back to first Type export
  const rootModule = (imported.default ?? findModuleExport(imported)) as Type | undefined;
  if (!rootModule || typeof rootModule !== "function") {
    throw new Error(
      `Could not find a module class in "${args.module}". Ensure the module is exported as the default export or as a named export.`,
    );
  }

  // Scan metadata without instantiating anything
  const scanned = buildScannedModule(rootModule);

  // Validate dependency graph before proceeding
  const diagnostics = validateScannedDependencies(scanned);
  if (diagnostics.length > 0) {
    const details = diagnostics
      .map(
        ({ consumer, dependency }) =>
          `  ${consumer} requires ${dependency} — no provider registered`,
      )
      .join("\n");
    const message =
      `Unresolvable dependencies detected:\n\n${details}\n\n` +
      "For each unresolved dependency, check that the module providing it is included\n" +
      'in your root module\'s "imports" array, or register a provider for it directly.';
    throw new Error(message);
  }

  if (scanned.controllerClasses.length === 0 && scanned.functionHandlers.length === 0) {
    process.stderr.write(`Warning: No handlers found in module "${args.module}"\n`);
  }

  // Serialize to manifest JSON
  const manifest = serializeManifest(scanned, args.module, {
    projectRoot: args.projectRoot,
  });

  // Output JSON to stdout
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

function findModuleExport(imported: Record<string, unknown>): unknown {
  for (const key of Object.keys(imported)) {
    if (key === "default") continue;
    const value = imported[key];
    if (typeof value === "function") {
      return value;
    }
  }
  return undefined;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(JSON.stringify({ error: message }) + "\n");
  process.exitCode = 1;
});
