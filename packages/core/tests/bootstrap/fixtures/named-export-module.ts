import "reflect-metadata";
import { Module } from "../../../src/decorators/module";
import { Controller } from "../../../src/decorators/controller";
import { Get } from "../../../src/decorators/http";

@Controller("/api")
class ApiHandler {
  @Get("/status")
  status() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [ApiHandler],
})
export class AppModule {}
