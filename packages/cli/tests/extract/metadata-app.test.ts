import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { buildScannedModule, validateScannedDependencies } from "../../src/extract/metadata-app";
import {
  Module,
  Controller,
  Get,
  Post,
  Injectable,
  Inject,
  createHttpHandler,
  MODULE_METADATA,
} from "@celerity-sdk/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

@Controller("/items")
class ItemsHandler {
  @Get("/")
  list() {
    return [];
  }

  @Post("/")
  create() {
    return {};
  }
}

@Controller("/users")
class UsersHandler {
  @Get("/{id}")
  getUser() {
    return {};
  }
}

const healthCheck = createHttpHandler({ path: "/health", method: "GET" }, () => ({
  status: "ok",
}));

@Module({
  controllers: [ItemsHandler],
  functionHandlers: [healthCheck],
})
class ItemsModule {}

@Module({
  controllers: [UsersHandler],
})
class UsersModule {}

@Module({
  imports: [ItemsModule, UsersModule],
})
class AppModule {}

@Module({})
class EmptyModule {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildScannedModule", () => {
  it("detects circular module imports", () => {
    @Module({})
    class ModuleA {}

    @Module({ imports: [ModuleA] })
    class ModuleB {}

    // Create A → B → A cycle
    Reflect.defineMetadata(MODULE_METADATA, { imports: [ModuleB] }, ModuleA);

    expect(() => buildScannedModule(ModuleA)).toThrow(/Circular module import detected/);
  });

  it("collects handler classes from a single module", () => {
    const result = buildScannedModule(ItemsModule);

    expect(result.controllerClasses).toEqual([ItemsHandler]);
    expect(result.functionHandlers).toHaveLength(1);
  });

  it("recursively collects handlers from imported modules", () => {
    const result = buildScannedModule(AppModule);

    expect(result.controllerClasses).toContain(ItemsHandler);
    expect(result.controllerClasses).toContain(UsersHandler);
    expect(result.controllerClasses).toHaveLength(2);
  });

  it("collects function handlers from modules", () => {
    const result = buildScannedModule(AppModule);

    expect(result.functionHandlers).toHaveLength(1);
    expect(result.functionHandlers[0].__celerity_handler).toBe(true);
    expect(result.functionHandlers[0].type).toBe("http");
  });

  it("returns empty arrays for a module with no handlers", () => {
    const result = buildScannedModule(EmptyModule);

    expect(result.controllerClasses).toEqual([]);
    expect(result.functionHandlers).toEqual([]);
  });

  it("does not visit the same module twice (cycle protection)", () => {
    // Both AppModule and ItemsModule exist in the tree — ItemsHandler should appear once
    const result = buildScannedModule(AppModule);

    const itemsCount = result.controllerClasses.filter((h) => h === ItemsHandler).length;
    expect(itemsCount).toBe(1);
  });

  it("returns empty for a class without @Module metadata", () => {
    class NotAModule {}
    const result = buildScannedModule(NotAModule);

    expect(result.controllerClasses).toEqual([]);
    expect(result.functionHandlers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Provider scanning fixtures
// ---------------------------------------------------------------------------

@Injectable()
class SomeService {}

// ---------------------------------------------------------------------------
// Provider scanning tests
// ---------------------------------------------------------------------------

describe("provider scanning", () => {
  it("collects plain class providers", () => {
    @Module({ providers: [SomeService] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);

    const entry = scanned.providers.find((p) => p.token === SomeService);
    expect(entry).toBeDefined();
    expect(entry!.providerType).toBe("class");
  });

  it("collects class providers with provide token", () => {
    @Module({ providers: [{ provide: "svc", useClass: SomeService }] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);

    const entry = scanned.providers.find((p) => p.token === "svc");
    expect(entry).toBeDefined();
    expect(entry!.providerType).toBe("class");
  });

  it("collects factory providers with inject deps", () => {
    @Module({
      providers: [{ provide: "config", useFactory: () => ({}), inject: [SomeService] }],
    })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);

    const entry = scanned.providers.find((p) => p.token === "config");
    expect(entry).toBeDefined();
    expect(entry!.providerType).toBe("factory");
    expect(entry!.dependencies).toContain(SomeService);
  });

  it("collects value providers with empty deps", () => {
    @Module({ providers: [{ provide: "API_KEY", useValue: "secret" }] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);

    const entry = scanned.providers.find((p) => p.token === "API_KEY");
    expect(entry).toBeDefined();
    expect(entry!.providerType).toBe("value");
    expect(entry!.dependencies).toEqual([]);
  });

  it("includes controllers as class providers", () => {
    @Controller("/some")
    class ProvScanController {
      @Get("/")
      list() {
        return [];
      }
    }

    @Module({ controllers: [ProvScanController] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);

    const entry = scanned.providers.find((p) => p.token === ProvScanController);
    expect(entry).toBeDefined();
    expect(entry!.providerType).toBe("class");
  });

  it("deduplicates providers across modules", () => {
    @Module({ providers: [SomeService] })
    class ChildModule {}

    @Module({ imports: [ChildModule], providers: [SomeService] })
    class ParentModule {}

    const scanned = buildScannedModule(ParentModule);

    const entries = scanned.providers.filter((p) => p.token === SomeService);
    expect(entries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Dependency validation tests
// ---------------------------------------------------------------------------

describe("validateScannedDependencies", () => {
  it("returns empty array when all dependencies are resolvable", () => {
    @Module({ providers: [SomeService] })
    class ValidModule {}

    const scanned = buildScannedModule(ValidModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toEqual([]);
  });

  it("returns empty array for class-only dependencies (implicitly constructable)", () => {
    @Injectable()
    class DepA {}

    @Injectable()
    class DepB {
      constructor(public a: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [DepA], DepB);

    @Module({ providers: [DepB] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toEqual([]);
  });

  it("detects a missing string token dependency", () => {
    @Injectable()
    class NeedsConfig {
      constructor(@Inject("DB_URL") public url: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsConfig);

    @Module({ providers: [NeedsConfig] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].consumer).toBe("NeedsConfig");
    expect(diagnostics[0].dependency).toBe("DB_URL");
  });

  it("detects a missing symbol token dependency", () => {
    const SECRET = Symbol("SECRET");

    @Injectable()
    class NeedsSecret {
      constructor(@Inject(SECRET) public secret: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsSecret);

    @Module({ providers: [NeedsSecret] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].consumer).toBe("NeedsSecret");
    expect(diagnostics[0].dependency).toBe("SECRET");
  });

  it("collects multiple missing dependencies", () => {
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

    @Module({ providers: [MultiMissing] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.dependency)).toContain("TOKEN_A");
    expect(diagnostics.map((d) => d.dependency)).toContain("TOKEN_B");
  });

  it("detects transitive missing dependencies through an unregistered class", () => {
    @Injectable()
    class DeepService {
      constructor(@Inject("DEEP_TOKEN") public dep: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], DeepService);

    @Injectable()
    class TopService {
      constructor(public deep: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [DeepService], TopService);

    @Module({ providers: [TopService] })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].consumer).toBe("DeepService");
    expect(diagnostics[0].dependency).toBe("DEEP_TOKEN");
  });

  it("returns empty array when value providers satisfy string tokens", () => {
    @Injectable()
    class NeedsConfig {
      constructor(@Inject("API_KEY") public key: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsConfig);

    @Module({
      providers: [NeedsConfig, { provide: "API_KEY", useValue: "secret-123" }],
    })
    class TestModule {}

    const scanned = buildScannedModule(TestModule);
    const diagnostics = validateScannedDependencies(scanned);

    expect(diagnostics).toEqual([]);
  });
});
