import type { FunctionHandlerDefinition } from "@celerity-sdk/types";
import type { HttpHandlerRequest } from "../../../src/functions/context";

/**
 * Plain function export — not registered in any @Module.
 * Used to test dynamic module import resolution.
 */
export function hello() {
  return { message: "Hello from standalone!" };
}

/**
 * FunctionHandlerDefinition export — not registered in any @Module.
 * Used to test dynamic module import with metadata extraction.
 */
export const goodbye: FunctionHandlerDefinition = {
  __celerity_handler: true,
  type: "http",
  metadata: {
    inject: [],
    layers: [],
    customMetadata: { source: "standalone" },
  },
  handler: async (...args: unknown[]) => {
    const req = args[0] as HttpHandlerRequest;
    return { message: "Goodbye!", path: req.path };
  },
};

/** Non-function export — used to test that non-callable exports are skipped. */
export const notAHandler = "just a string";
