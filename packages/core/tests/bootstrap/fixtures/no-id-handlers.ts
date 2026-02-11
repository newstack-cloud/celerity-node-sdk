import type { FunctionHandlerDefinition } from "@celerity-sdk/types";
import type { HttpHandlerRequest } from "../../../src/functions/context";

/**
 * A FunctionHandlerDefinition WITHOUT an explicit id.
 * Exported so it can be resolved via dynamic module import,
 * and also registered via @Module to test reference matching.
 */
export const greet: FunctionHandlerDefinition = {
  __celerity_handler: true,
  type: "http",
  metadata: {},
  handler: async (...args: unknown[]) => {
    const req = args[0] as HttpHandlerRequest;
    return { greeting: "Hi!", name: req.params.name ?? "world" };
  },
};
