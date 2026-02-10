import "reflect-metadata";
import { Module } from "../../../src/decorators/module";
import { Controller } from "../../../src/decorators/controller";
import { Get } from "../../../src/decorators/http";

@Controller("/health")
class HealthHandler {
  @Get("/")
  check() {
    return { ok: true };
  }
}

@Module({
  controllers: [HealthHandler],
})
export default class TestModule {}
