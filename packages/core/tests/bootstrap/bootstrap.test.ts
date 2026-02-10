import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { bootstrap } from "../../src/bootstrap/bootstrap";
import { Module } from "../../src/decorators/module";
import { Controller } from "../../src/decorators/controller";
import { Get, Post } from "../../src/decorators/http";
import { Injectable } from "../../src/decorators/injectable";
import { Container } from "../../src/di/container";
import { HandlerRegistry } from "../../src/handlers/registry";
import { createHttpHandler } from "../../src/functions/create-handler";

@Injectable()
class TestService {
  getValue(): string {
    return "test-value";
  }
}

@Controller("/items")
class ItemHandler {
  @Get("/")
  list() {
    return [];
  }

  @Post("/")
  create() {
    return { created: true };
  }
}

const getHealth = createHttpHandler(
  { path: "/health", method: "GET" },
  () => ({ ok: true }),
);

@Module({
  controllers: [ItemHandler],
  providers: [TestService],
  functionHandlers: [getHealth],
})
class TestModule {}

@Module({})
class EmptyModule {}

describe("bootstrap", () => {
  it("returns a container and registry", async () => {
    const result = await bootstrap(TestModule);

    expect(result.container).toBeInstanceOf(Container);
    expect(result.registry).toBeInstanceOf(HandlerRegistry);
  });

  it("registers providers in the container", async () => {
    const { container } = await bootstrap(TestModule);

    const service = await container.resolve<TestService>(TestService);
    expect(service).toBeInstanceOf(TestService);
    expect(service.getValue()).toBe("test-value");
  });

  it("registers class handlers in the registry", async () => {
    const { registry } = await bootstrap(TestModule);

    const listHandler = registry.getHandler("/items", "GET");
    const createHandler = registry.getHandler("/items", "POST");

    expect(listHandler).toBeDefined();
    expect(listHandler!.method).toBe("GET");
    expect(createHandler).toBeDefined();
    expect(createHandler!.method).toBe("POST");
  });

  it("registers function handlers in the registry", async () => {
    const { registry } = await bootstrap(TestModule);

    const healthHandler = registry.getHandler("/health", "GET");
    expect(healthHandler).toBeDefined();
    expect(healthHandler!.isFunctionHandler).toBe(true);
  });

  it("handles empty modules", async () => {
    const result = await bootstrap(EmptyModule);

    expect(result.container).toBeInstanceOf(Container);
    expect(result.registry.getAllHandlers()).toHaveLength(0);
  });

  it("handles modules that import other modules", async () => {
    @Injectable()
    class SharedService {
      shared = true;
    }

    @Module({ providers: [SharedService] })
    class SharedModule {}

    @Controller("/root")
    class RootHandler {
      @Get("/")
      root() {
        return "root";
      }
    }

    @Module({
      imports: [SharedModule],
      controllers: [RootHandler],
    })
    class AppModule {}

    const { container, registry } = await bootstrap(AppModule);

    const service = await container.resolve<SharedService>(SharedService);
    expect(service.shared).toBe(true);
    expect(registry.getHandler("/root", "GET")).toBeDefined();
  });
});
