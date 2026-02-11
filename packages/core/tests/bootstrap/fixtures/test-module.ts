import "reflect-metadata";
import { Module } from "../../../src/decorators/module";
import { Controller } from "../../../src/decorators/controller";
import { Get } from "../../../src/decorators/http";
import type { FunctionHandlerDefinition } from "@celerity-sdk/types";
import type { HttpHandlerRequest } from "../../../src/functions/context";

@Controller("/health")
class HealthHandler {
  @Get("/")
  check() {
    return { ok: true };
  }
}

// Simulates a blueprint-first function handler whose id is set by the
// build pipeline / CLI extraction tool (developers never set id themselves).
const getOrder: FunctionHandlerDefinition = {
  __celerity_handler: true,
  id: "app.module.getOrder",
  type: "http",
  metadata: {},
  handler: async (...args: unknown[]) => {
    const req = args[0] as HttpHandlerRequest;
    return { orderId: req.params.orderId ?? "unknown" };
  },
};

@Module({
  controllers: [HealthHandler],
  functionHandlers: [getOrder],
})
export default class TestModule {}
