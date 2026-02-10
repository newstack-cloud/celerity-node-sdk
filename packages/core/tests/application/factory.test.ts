import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { CelerityFactory } from "../../src/application/factory";
import { TestingApplication } from "../../src/testing/test-app";
import { Module } from "../../src/decorators/module";
import { Controller } from "../../src/decorators/controller";
import { Get, Post } from "../../src/decorators/http";
import { Injectable } from "../../src/decorators/injectable";
import { Body, Param } from "../../src/decorators/params";
import { Container } from "../../src/di/container";
import { HandlerRegistry } from "../../src/handlers/registry";

// ── Fixtures ──────────────────────────────────────────────────────────────────

@Injectable()
class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

@Controller("/items")
class ItemHandler {
  @Get("/")
  list(): { items: string[] } {
    return { items: ["a", "b"] };
  }

  @Get("/{id}")
  getById(@Param("id") id: string): { id: string } {
    return { id };
  }

  @Post("/")
  create(@Body() body: unknown): { created: true; data: unknown } {
    return { created: true, data: body };
  }
}

@Module({
  controllers: [ItemHandler],
  providers: [GreetingService],
})
class TestModule {}

@Module({
  controllers: [],
  providers: [],
})
class EmptyModule {}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CelerityFactory.createTestingApp", () => {
  it("should return a TestingApplication instance", async () => {
    // Arrange & Act
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Assert
    expect(app).toBeInstanceOf(TestingApplication);
  });

  it("should create an app with a working container that resolves providers", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const container = app.getContainer();
    const service = await container.resolve<GreetingService>(GreetingService);

    // Assert
    expect(container).toBeInstanceOf(Container);
    expect(service).toBeInstanceOf(GreetingService);
    expect(service.greet("World")).toBe("Hello, World!");
  });

  it("should create an app with a working registry that contains handlers", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const registry = app.getRegistry();
    const allHandlers = registry.getAllHandlers();

    // Assert
    expect(registry).toBeInstanceOf(HandlerRegistry);
    expect(allHandlers.length).toBeGreaterThanOrEqual(3);
  });

  it("should resolve GET handler for registered routes", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const registry = app.getRegistry();
    const listHandler = registry.getHandler("/items", "GET");

    // Assert
    expect(listHandler).toBeDefined();
    expect(listHandler!.method).toBe("GET");
    expect(listHandler!.path).toBe("/items");
  });

  it("should resolve POST handler for registered routes", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const registry = app.getRegistry();
    const createHandler = registry.getHandler("/items", "POST");

    // Assert
    expect(createHandler).toBeDefined();
    expect(createHandler!.method).toBe("POST");
    expect(createHandler!.path).toBe("/items");
  });

  it("should resolve parameterized route handlers", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const registry = app.getRegistry();
    const getByIdHandler = registry.getHandler("/items/42", "GET");

    // Assert
    expect(getByIdHandler).toBeDefined();
    expect(getByIdHandler!.method).toBe("GET");
    expect(getByIdHandler!.path).toBe("/items/{id}");
  });

  it("should return undefined for unregistered routes", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const registry = app.getRegistry();
    const handler = registry.getHandler("/not-found", "GET");

    // Assert
    expect(handler).toBeUndefined();
  });

  it("should handle an empty module without errors", async () => {
    // Arrange & Act
    const app = await CelerityFactory.createTestingApp(EmptyModule);

    // Assert
    expect(app).toBeInstanceOf(TestingApplication);
    expect(app.getRegistry().getAllHandlers()).toHaveLength(0);
  });

  it("should register handler classes in the container automatically", async () => {
    // Arrange
    const app = await CelerityFactory.createTestingApp(TestModule);

    // Act
    const container = app.getContainer();
    const hasHandler = container.has(ItemHandler);

    // Assert
    expect(hasHandler).toBe(true);
  });

  it("should support modules that import other modules", async () => {
    // Arrange
    @Injectable()
    class SharedService {
      value = "shared";
    }

    @Module({
      providers: [SharedService],
    })
    class SharedModule {}

    @Controller("/health")
    class HealthHandler {
      @Get("/")
      check(): { ok: boolean } {
        return { ok: true };
      }
    }

    @Module({
      imports: [SharedModule],
      controllers: [HealthHandler],
    })
    class AppModule {}

    // Act
    const app = await CelerityFactory.createTestingApp(AppModule);
    const container = app.getContainer();
    const sharedService = await container.resolve<SharedService>(SharedService);
    const healthHandler = app.getRegistry().getHandler("/health", "GET");

    // Assert
    expect(sharedService).toBeInstanceOf(SharedService);
    expect(sharedService.value).toBe("shared");
    expect(healthHandler).toBeDefined();
    expect(healthHandler!.method).toBe("GET");
  });
});
