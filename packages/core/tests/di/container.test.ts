import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Container } from "../../src/di/container";
import { Injectable, Inject } from "../../src/decorators/injectable";
import { Controller } from "../../src/decorators/controller";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

@Injectable()
class Logger {
  log(msg: string) {
    return msg;
  }
}

@Injectable()
class Database {
  query(sql: string) {
    return sql;
  }
}

@Injectable()
class UserService {
  constructor(
    public logger: Logger,
    public db: Database,
  ) {}
}

// Service that uses @Inject to override a dependency token
const DB_TOKEN = Symbol("DB_TOKEN");

@Injectable()
class OrderService {
  constructor(
    public logger: Logger,
    @Inject(DB_TOKEN) public db: Database,
  ) {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Container", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  // -----------------------------------------------------------------------
  // registerValue / resolve
  // -----------------------------------------------------------------------

  describe("registerValue", () => {
    it("should register and resolve a value", async () => {
      // Arrange
      const token = Symbol("config");
      const config = { port: 3000 };

      // Act
      container.registerValue(token, config);
      const resolved = await container.resolve(token);

      // Assert
      expect(resolved).toBe(config);
    });

    it("should resolve a string-token value", async () => {
      // Arrange
      container.registerValue("API_KEY", "secret-key-123");

      // Act
      const result = await container.resolve<string>("API_KEY");

      // Assert
      expect(result).toBe("secret-key-123");
    });
  });

  // -----------------------------------------------------------------------
  // register with ValueProvider
  // -----------------------------------------------------------------------

  describe("register (ValueProvider)", () => {
    it("should resolve a value provider", async () => {
      // Arrange
      const token = Symbol("val");
      container.register(token, { useValue: 42 });

      // Act
      const result = await container.resolve<number>(token);

      // Assert
      expect(result).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // register with ClassProvider
  // -----------------------------------------------------------------------

  describe("register (ClassProvider)", () => {
    it("should resolve a class provider and return an instance", async () => {
      // Arrange
      container.registerClass(Logger);
      container.register(Logger, { useClass: Logger });

      // Act
      const logger = await container.resolve<Logger>(Logger);

      // Assert
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  // -----------------------------------------------------------------------
  // register with FactoryProvider
  // -----------------------------------------------------------------------

  describe("register (FactoryProvider)", () => {
    it("should resolve a factory provider", async () => {
      // Arrange
      const token = Symbol("factory");
      container.register(token, {
        useFactory: () => ({ created: true }),
      });

      // Act
      const result = await container.resolve<{ created: boolean }>(token);

      // Assert
      expect(result).toEqual({ created: true });
    });

    it("should inject dependencies into a factory provider", async () => {
      // Arrange
      container.registerClass(Logger);
      const token = Symbol("withDeps");
      container.register(token, {
        useFactory: (logger: Logger) => ({ logger }),
        inject: [Logger],
      });

      // Act
      const result = await container.resolve<{ logger: Logger }>(token);

      // Assert
      expect(result.logger).toBeInstanceOf(Logger);
    });

    it("should support async factory functions", async () => {
      // Arrange
      const token = Symbol("async-factory");
      container.register(token, {
        useFactory: async () => {
          return { ready: true };
        },
      });

      // Act
      const result = await container.resolve<{ ready: boolean }>(token);

      // Assert
      expect(result).toEqual({ ready: true });
    });
  });

  // -----------------------------------------------------------------------
  // registerClass
  // -----------------------------------------------------------------------

  describe("registerClass", () => {
    it("should register and resolve a class by its constructor", async () => {
      // Arrange
      container.registerClass(Logger);

      // Act
      const logger = await container.resolve<Logger>(Logger);

      // Assert
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.log("hello")).toBe("hello");
    });
  });

  // -----------------------------------------------------------------------
  // Auto-wiring via reflect-metadata (design:paramtypes)
  // -----------------------------------------------------------------------

  describe("auto-wiring constructor dependencies", () => {
    it("should auto-resolve constructor dependencies via design:paramtypes", async () => {
      // Arrange
      container.registerClass(Logger);
      container.registerClass(Database);
      container.registerClass(UserService);

      // Act
      const userService = await container.resolve<UserService>(UserService);

      // Assert
      expect(userService).toBeInstanceOf(UserService);
      expect(userService.logger).toBeInstanceOf(Logger);
      expect(userService.db).toBeInstanceOf(Database);
    });

    it("should use @Inject token overrides during resolution", async () => {
      // Arrange
      container.registerClass(Logger);
      const customDb = new Database();
      container.registerValue(DB_TOKEN, customDb);
      container.registerClass(OrderService);

      // Act
      const orderService =
        await container.resolve<OrderService>(OrderService);

      // Assert
      expect(orderService).toBeInstanceOf(OrderService);
      expect(orderService.logger).toBeInstanceOf(Logger);
      expect(orderService.db).toBe(customDb);
    });
  });

  // -----------------------------------------------------------------------
  // Singleton behavior — resolve returns the same instance
  // -----------------------------------------------------------------------

  describe("singleton caching", () => {
    it("should return the same instance on subsequent resolves", async () => {
      // Arrange
      container.registerClass(Logger);

      // Act
      const first = await container.resolve<Logger>(Logger);
      const second = await container.resolve<Logger>(Logger);

      // Assert
      expect(first).toBe(second);
    });

    it("should cache instances produced by factory providers", async () => {
      // Arrange
      const token = Symbol("cached-factory");
      let callCount = 0;
      container.register(token, {
        useFactory: () => {
          callCount++;
          return { id: callCount };
        },
      });

      // Act
      const first = await container.resolve(token);
      const second = await container.resolve(token);

      // Assert
      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // has()
  // -----------------------------------------------------------------------

  describe("has", () => {
    it("should return true for a registered provider", () => {
      // Arrange
      const token = Symbol("exists");
      container.register(token, { useValue: "yes" });

      // Act & Assert
      expect(container.has(token)).toBe(true);
    });

    it("should return true for a registered value", () => {
      // Arrange
      const token = Symbol("value");
      container.registerValue(token, 123);

      // Act & Assert
      expect(container.has(token)).toBe(true);
    });

    it("should return false for an unknown token", () => {
      // Arrange
      const token = Symbol("unknown");

      // Act & Assert
      expect(container.has(token)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("should throw when resolving an unregistered string token", async () => {
      // Arrange — nothing registered

      // Act & Assert
      await expect(container.resolve("MISSING")).rejects.toThrow(
        /No provider registered for MISSING/,
      );
    });

    it("should throw when resolving an unregistered symbol token", async () => {
      // Arrange
      const token = Symbol("missing");

      // Act & Assert
      await expect(container.resolve(token)).rejects.toThrow(
        /No provider registered for/,
      );
    });

    it("should include remediation suggestion in the error message", async () => {
      await expect(container.resolve("MISSING")).rejects.toThrow(
        /Ensure the module providing it/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Fallback: resolving a class token with no registered provider
  // -----------------------------------------------------------------------

  describe("implicit class resolution", () => {
    it("should resolve a class token without explicit registration by constructing it", async () => {
      // Arrange — Logger is not registered, but it is a function (class)

      // Act
      const logger = await container.resolve<Logger>(Logger);

      // Assert
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  // -----------------------------------------------------------------------
  // Circular dependency detection
  // -----------------------------------------------------------------------

  describe("circular dependency detection", () => {
    @Injectable()
    class CircB {
      constructor(public a: unknown) {}
    }

    @Injectable()
    class CircA {
      constructor(public b: CircB) {}
    }

    // Manually wire circular design:paramtypes since TS can't
    // represent true circular references at decoration time.
    Reflect.defineMetadata("design:paramtypes", [CircB], CircA);
    Reflect.defineMetadata("design:paramtypes", [CircA], CircB);

    it("throws on direct circular dependency", async () => {
      // Arrange
      container.registerClass(CircA);
      container.registerClass(CircB);

      // Act & Assert
      await expect(container.resolve(CircA)).rejects.toThrow(
        /Circular dependency detected/,
      );
      await expect(container.resolve(CircA)).rejects.toThrow(/CircA/);
      // Re-create container to clear resolving state
      container = new Container();
      container.registerClass(CircA);
      container.registerClass(CircB);
      await expect(container.resolve(CircA)).rejects.toThrow(/CircB/);
    });

    it("throws on transitive circular dependency", async () => {
      // Arrange — A → B → C → A
      @Injectable()
      class TransC {
        constructor(public a: unknown) {}
      }

      @Injectable()
      class TransB {
        constructor(public c: TransC) {}
      }

      @Injectable()
      class TransA {
        constructor(public b: TransB) {}
      }

      Reflect.defineMetadata("design:paramtypes", [TransB], TransA);
      Reflect.defineMetadata("design:paramtypes", [TransC], TransB);
      Reflect.defineMetadata("design:paramtypes", [TransA], TransC);

      container.registerClass(TransA);
      container.registerClass(TransB);
      container.registerClass(TransC);

      // Act & Assert
      await expect(container.resolve(TransA)).rejects.toThrow(
        /Circular dependency detected/,
      );
    });

    it("does not throw for diamond dependencies", async () => {
      // Arrange — A depends on B and C, both depend on D
      @Injectable()
      class DiamondD {
        value = "d";
      }

      @Injectable()
      class DiamondB {
        constructor(public d: DiamondD) {}
      }

      @Injectable()
      class DiamondC {
        constructor(public d: DiamondD) {}
      }

      @Injectable()
      class DiamondA {
        constructor(
          public b: DiamondB,
          public c: DiamondC,
        ) {}
      }

      Reflect.defineMetadata("design:paramtypes", [DiamondB, DiamondC], DiamondA);
      Reflect.defineMetadata("design:paramtypes", [DiamondD], DiamondB);
      Reflect.defineMetadata("design:paramtypes", [DiamondD], DiamondC);
      Reflect.defineMetadata("design:paramtypes", [], DiamondD);

      container.registerClass(DiamondA);
      container.registerClass(DiamondB);
      container.registerClass(DiamondC);
      container.registerClass(DiamondD);

      // Act
      const result = await container.resolve<DiamondA>(DiamondA);

      // Assert
      expect(result).toBeInstanceOf(DiamondA);
      expect(result.b).toBeInstanceOf(DiamondB);
      expect(result.c).toBeInstanceOf(DiamondC);
      expect(result.b.d).toBeInstanceOf(DiamondD);
      // Diamond: B and C share the same D singleton
      expect(result.b.d).toBe(result.c.d);
    });

    it("throws when resolveClass encounters cycle", async () => {
      // Arrange
      @Injectable()
      class CycleX {
        constructor(public y: unknown) {}
      }

      @Injectable()
      class CycleY {
        constructor(public x: CycleX) {}
      }

      Reflect.defineMetadata("design:paramtypes", [CycleY], CycleX);
      Reflect.defineMetadata("design:paramtypes", [CycleX], CycleY);

      container.registerClass(CycleX);
      container.registerClass(CycleY);

      // Act & Assert
      await expect(container.resolveClass(CycleX)).rejects.toThrow(
        /Circular dependency detected/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Dependency graph
  // -----------------------------------------------------------------------

  describe("dependency graph", () => {
    it("records class dependencies from design:paramtypes", async () => {
      // Arrange
      container.registerClass(Logger);
      container.registerClass(Database);
      container.registerClass(UserService);

      // Act
      await container.resolve<UserService>(UserService);

      // Assert
      const deps = container.getDependencies(UserService);
      expect(deps.has(Logger)).toBe(true);
      expect(deps.has(Database)).toBe(true);
      expect(deps.size).toBe(2);
    });

    it("records factory provider inject dependencies", async () => {
      // Arrange
      const token = Symbol("factory-with-deps");
      container.registerClass(Logger);
      container.registerClass(Database);
      container.register(token, {
        useFactory: (logger: Logger, db: Database) => ({ logger, db }),
        inject: [Logger, Database],
      });

      // Act
      await container.resolve(token);

      // Assert
      const deps = container.getDependencies(token);
      expect(deps.has(Logger)).toBe(true);
      expect(deps.has(Database)).toBe(true);
      expect(deps.size).toBe(2);
    });

    it("returns empty set for value providers", () => {
      // Arrange
      const token = Symbol("val");
      container.register(token, { useValue: "hello" });

      // Act
      const deps = container.getDependencies(token);

      // Assert
      expect(deps.size).toBe(0);
    });

    it("returns empty set for unknown tokens", () => {
      // Arrange
      const token = Symbol("never-registered");

      // Act
      const deps = container.getDependencies(token);

      // Assert
      expect(deps.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // closeAll
  // -----------------------------------------------------------------------

  describe("closeAll", () => {
    it("calls close methods in reverse registration order (LIFO)", async () => {
      // Arrange
      const order: string[] = [];
      const svc1 = { close: vi.fn(() => order.push("svc1")) };
      const svc2 = { close: vi.fn(() => order.push("svc2")) };
      const svc3 = { close: vi.fn(() => order.push("svc3")) };

      container.registerValue("svc1", svc1);
      container.registerValue("svc2", svc2);
      container.registerValue("svc3", svc3);

      // Act
      await container.closeAll();

      // Assert
      expect(order).toEqual(["svc3", "svc2", "svc1"]);
    });

    it("auto-detects close() method", async () => {
      // Arrange
      const svc = { close: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.close).toHaveBeenCalledOnce();
    });

    it("auto-detects end() method", async () => {
      // Arrange
      const svc = { end: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.end).toHaveBeenCalledOnce();
    });

    it("auto-detects quit() method", async () => {
      // Arrange
      const svc = { quit: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.quit).toHaveBeenCalledOnce();
    });

    it("auto-detects disconnect() method", async () => {
      // Arrange
      const svc = { disconnect: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.disconnect).toHaveBeenCalledOnce();
    });

    it("auto-detects $disconnect() method", async () => {
      // Arrange
      const svc = { $disconnect: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.$disconnect).toHaveBeenCalledOnce();
    });

    it("auto-detects destroy() method", async () => {
      // Arrange
      const svc = { destroy: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.destroy).toHaveBeenCalledOnce();
    });

    it("prefers close() over end() when both present", async () => {
      // Arrange
      const svc = { close: vi.fn(), end: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.close).toHaveBeenCalledOnce();
      expect(svc.end).not.toHaveBeenCalled();
    });

    it("uses onClose callback when provided", async () => {
      // Arrange
      const svc = { close: vi.fn() };
      const onClose = vi.fn();
      container.register("svc", { useValue: svc, onClose });

      // Act
      await container.closeAll();

      // Assert
      expect(onClose).toHaveBeenCalledWith(svc);
      expect(svc.close).not.toHaveBeenCalled();
    });

    it("swallows errors and continues closing remaining services", async () => {
      // Arrange
      const failing = {
        close: vi.fn(() => {
          throw new Error("close failed");
        }),
      };
      const healthy = { close: vi.fn() };

      container.registerValue("failing", failing);
      container.registerValue("healthy", healthy);

      // Act
      await container.closeAll();

      // Assert — both were attempted, healthy still closed
      expect(failing.close).toHaveBeenCalledOnce();
      expect(healthy.close).toHaveBeenCalledOnce();
    });

    it("clears close stack after closeAll", async () => {
      // Arrange
      const svc = { close: vi.fn() };
      container.registerValue("svc", svc);

      // Act
      await container.closeAll();
      await container.closeAll();

      // Assert — only called once (first closeAll), not again
      expect(svc.close).toHaveBeenCalledTimes(1);
    });

    it("does not track primitive values", async () => {
      // Arrange
      container.registerValue("str", "hello");
      container.registerValue("num", 42);

      // Act & Assert — should not throw
      await expect(container.closeAll()).resolves.toBeUndefined();
    });

    it("does not track plain objects without close methods", async () => {
      // Arrange
      container.registerValue("plain", { foo: "bar" });

      // Act & Assert — should not throw
      await expect(container.closeAll()).resolves.toBeUndefined();
    });

    it("handles async close methods", async () => {
      // Arrange
      const order: string[] = [];
      const svc = {
        close: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          order.push("closed");
        }),
      };
      container.registerValue("async-svc", svc);

      // Act
      await container.closeAll();

      // Assert
      expect(svc.close).toHaveBeenCalledOnce();
      expect(order).toEqual(["closed"]);
    });
  });

  // -----------------------------------------------------------------------
  // validateDependencies
  // -----------------------------------------------------------------------

  describe("validateDependencies", () => {
    it("should not throw when all dependencies are resolvable", () => {
      container.registerClass(Logger);
      container.registerClass(Database);
      container.registerClass(UserService);

      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should not throw when string/symbol tokens have providers", () => {
      container.registerClass(Logger);
      container.registerValue(DB_TOKEN, new Database());
      container.registerClass(OrderService);

      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should not throw for an empty container", () => {
      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should not throw for value providers (no deps)", () => {
      container.register("config", { useValue: { port: 3000 } });

      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should accept unregistered class tokens as implicitly constructable", () => {
      // UserService depends on Logger and Database but neither is registered.
      // Since they are class tokens, they can be implicitly constructed.
      container.registerClass(UserService);

      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should throw listing a missing string token dependency", () => {
      @Injectable()
      class ConfigConsumer {
        constructor(@Inject("APP_CONFIG") public config: unknown) {}
      }
      Reflect.defineMetadata("design:paramtypes", [Object], ConfigConsumer);
      container.registerClass(ConfigConsumer);

      expect(() => container.validateDependencies()).toThrow(/Unresolvable dependencies/);
      expect(() => container.validateDependencies()).toThrow(
        /ConfigConsumer requires APP_CONFIG/,
      );
    });

    it("should throw listing a missing symbol token dependency", () => {
      const MISSING = Symbol("MISSING");

      @Injectable()
      class SymbolConsumer {
        constructor(@Inject(MISSING) public dep: unknown) {}
      }
      Reflect.defineMetadata("design:paramtypes", [Object], SymbolConsumer);
      container.registerClass(SymbolConsumer);

      expect(() => container.validateDependencies()).toThrow(/Unresolvable dependencies/);
      expect(() => container.validateDependencies()).toThrow(
        /SymbolConsumer requires Symbol\(MISSING\)/,
      );
    });

    it("should collect all missing dependencies in a single error", () => {
      const TOKEN_A = "TOKEN_A";
      const TOKEN_B = Symbol("TOKEN_B");

      @Injectable()
      class MultiMissing {
        constructor(
          @Inject(TOKEN_A) public a: unknown,
          @Inject(TOKEN_B) public b: unknown,
        ) {}
      }
      Reflect.defineMetadata("design:paramtypes", [Object, Object], MultiMissing);
      container.registerClass(MultiMissing);

      expect(() => container.validateDependencies()).toThrow(/TOKEN_A/);
      expect(() => container.validateDependencies()).toThrow(/TOKEN_B/);
    });

    it("should detect transitive missing dependencies", () => {
      @Injectable()
      class DeepService {
        constructor(@Inject("DEEP_TOKEN") public dep: unknown) {}
      }
      Reflect.defineMetadata("design:paramtypes", [Object], DeepService);

      @Injectable()
      class MiddleService {
        constructor(public deep: DeepService) {}
      }
      Reflect.defineMetadata("design:paramtypes", [DeepService], MiddleService);

      container.registerClass(MiddleService);
      container.registerClass(DeepService);

      expect(() => container.validateDependencies()).toThrow(/DeepService requires DEEP_TOKEN/);
    });

    it("should detect missing dependencies in factory providers", () => {
      const token = Symbol("factory");
      container.register(token, {
        useFactory: (dep: unknown) => ({ dep }),
        inject: ["MISSING_FACTORY_DEP"],
      });

      expect(() => container.validateDependencies()).toThrow(/MISSING_FACTORY_DEP/);
    });

    it("should detect missing dependencies in useClass providers", () => {
      @Injectable()
      class ClassTarget {
        constructor(@Inject("MISSING_CLASS_DEP") public dep: unknown) {}
      }
      Reflect.defineMetadata("design:paramtypes", [Object], ClassTarget);

      const token = Symbol("class-provider");
      container.register(token, { useClass: ClassTarget });

      expect(() => container.validateDependencies()).toThrow(
        /Symbol\(class-provider\) requires MISSING_CLASS_DEP/,
      );
    });

    it("should handle circular class references without infinite loops", () => {
      @Injectable()
      class CircA {
        constructor(public b: unknown) {}
      }

      @Injectable()
      class CircB {
        constructor(public a: CircA) {}
      }

      Reflect.defineMetadata("design:paramtypes", [CircB], CircA);
      Reflect.defineMetadata("design:paramtypes", [CircA], CircB);

      container.registerClass(CircA);
      container.registerClass(CircB);

      // Both are class tokens so considered resolvable — should not hang or throw
      expect(() => container.validateDependencies()).not.toThrow();
    });

    it("should treat registerValue instances as resolvable", () => {
      container.registerValue(DB_TOKEN, new Database());
      container.registerClass(OrderService);

      expect(() => container.validateDependencies()).not.toThrow();
    });
  });

  describe("@Injectable() enforcement", () => {
    it("throws for undecorated class with constructor params", async () => {
      // No @Injectable() decorator — SWC won't emit design:paramtypes
      class UndecoratedWithDeps {
        constructor(public dep: Logger) {}
      }

      container.registerClass(UndecoratedWithDeps);

      await expect(container.resolve(UndecoratedWithDeps)).rejects.toThrow(
        /UndecoratedWithDeps.*not decorated with @Injectable/,
      );
    });

    it("allows undecorated class with zero-arg constructor", async () => {
      class NoArgService {
        value = "ok";
      }

      container.registerClass(NoArgService);

      const instance = await container.resolve<NoArgService>(NoArgService);
      expect(instance.value).toBe("ok");
    });

    it("allows @Injectable() decorated class", async () => {
      container.registerClass(Logger);

      const instance = await container.resolve<Logger>(Logger);
      expect(instance).toBeInstanceOf(Logger);
    });

    it("allows @Controller() decorated class (also sets INJECTABLE_METADATA)", async () => {
      @Controller("/test")
      class TestController {
        constructor(public logger: Logger) {}
      }

      container.registerClass(Logger);
      container.registerClass(TestController);

      const instance = await container.resolve<TestController>(TestController);
      expect(instance).toBeInstanceOf(TestController);
      expect(instance.logger).toBeInstanceOf(Logger);
    });

    it("does not affect factory providers", async () => {
      class NotInjectable {
        constructor(public value: string) {}
      }

      container.register(NotInjectable, {
        useFactory: () => new NotInjectable("from-factory"),
      });

      const instance = await container.resolve<NotInjectable>(NotInjectable);
      expect(instance.value).toBe("from-factory");
    });

    it("does not affect value providers", async () => {
      class NotInjectable {
        constructor(public value: string) {}
      }

      container.register(NotInjectable, {
        useValue: new NotInjectable("from-value"),
      });

      const instance = await container.resolve<NotInjectable>(NotInjectable);
      expect(instance.value).toBe("from-value");
    });
  });
});
