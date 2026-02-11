import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildModuleGraph,
  walkModuleGraph,
  validateModuleGraph,
} from "../../src/bootstrap/module-graph";
import { Container } from "../../src/di/container";
import { Module } from "../../src/decorators/module";
import { Injectable, Inject } from "../../src/decorators/injectable";
import { Controller } from "../../src/decorators/controller";
import { Get } from "../../src/decorators/http";
import { MODULE_METADATA } from "../../src/metadata/constants";

// ---------------------------------------------------------------------------
// Test services
// ---------------------------------------------------------------------------

@Injectable()
class ServiceA {
  value = "a";
}

@Injectable()
class ServiceB {
  value = "b";
}

const TOKEN_C = Symbol("TOKEN_C");

@Injectable()
class ServiceD {
  constructor(public a: ServiceA) {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildModuleGraph", () => {
  it("builds a pure graph without requiring a container", () => {
    @Module({ providers: [ServiceA, ServiceB] })
    class AppModule {}

    const graph = buildModuleGraph(AppModule);

    expect(graph.size).toBe(1);
    const node = graph.get(AppModule)!;
    expect(node.ownTokens.has(ServiceA)).toBe(true);
    expect(node.ownTokens.has(ServiceB)).toBe(true);
  });

  it("detects circular imports", () => {
    @Module({})
    class ModuleA {}

    @Module({ imports: [ModuleA] })
    class ModuleB {}

    Reflect.defineMetadata(MODULE_METADATA, { imports: [ModuleB] }, ModuleA);

    expect(() => buildModuleGraph(ModuleA)).toThrow(/Circular module import detected/);
  });

  it("deduplicates visited modules", () => {
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class SharedModule {}

    @Module({ imports: [SharedModule] })
    class ModuleX {}

    @Module({ imports: [SharedModule] })
    class ModuleY {}

    @Module({ imports: [ModuleX, ModuleY] })
    class AppModule {}

    const graph = buildModuleGraph(AppModule);

    expect(graph.size).toBe(4);
  });

  it("collects providers, controllers, function handlers, and exports", () => {
    @Controller("/test")
    class TestController {
      @Get("/")
      get() {
        return "ok";
      }
    }

    @Module({
      providers: [ServiceA],
      controllers: [TestController],
      exports: [ServiceA],
    })
    class AppModule {}

    const graph = buildModuleGraph(AppModule);
    const node = graph.get(AppModule)!;

    expect(node.ownTokens.has(ServiceA)).toBe(true);
    expect(node.ownTokens.has(TestController)).toBe(true);
    expect(node.controllers).toEqual([TestController]);
    expect(node.exports.has(ServiceA)).toBe(true);
  });
});

describe("walkModuleGraph", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it("collects a single module's providers, controllers, and function handlers", () => {
    // Arrange
    @Controller("/test")
    class TestController {
      @Get("/")
      get() {
        return "ok";
      }
    }

    @Module({
      providers: [ServiceA],
      controllers: [TestController],
    })
    class AppModule {}

    // Act
    const graph = walkModuleGraph(AppModule, container);

    // Assert
    expect(graph.size).toBe(1);
    const node = graph.get(AppModule)!;
    expect(node.ownTokens.has(ServiceA)).toBe(true);
    expect(node.ownTokens.has(TestController)).toBe(true);
    expect(node.controllers).toEqual([TestController]);
    expect(node.exports.size).toBe(0);
  });

  it("registers providers in the container during walk", () => {
    // Arrange
    @Module({ providers: [ServiceA] })
    class AppModule {}

    // Act
    walkModuleGraph(AppModule, container);

    // Assert
    expect(container.has(ServiceA)).toBe(true);
  });

  it("collects imports recursively and deduplicates", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class SharedModule {}

    @Module({ imports: [SharedModule], providers: [ServiceB], exports: [ServiceB] })
    class FeatureModule {}

    @Module({ imports: [SharedModule, FeatureModule] })
    class AppModule {}

    // Act
    const graph = walkModuleGraph(AppModule, container);

    // Assert
    expect(graph.size).toBe(3);
    expect(graph.has(SharedModule)).toBe(true);
    expect(graph.has(FeatureModule)).toBe(true);
    expect(graph.has(AppModule)).toBe(true);
  });

  it("detects circular module imports and throws with cycle path", () => {
    // Arrange — create circular import via metadata (can't use decorators for circular)
    @Module({})
    class ModuleA {}

    @Module({ imports: [ModuleA] })
    class ModuleB {}

    // Manually set ModuleA to import ModuleB (creating A → B → A cycle)
    Reflect.defineMetadata(
      MODULE_METADATA,
      { imports: [ModuleB] },
      ModuleA,
    );

    // Act & Assert
    expect(() => walkModuleGraph(ModuleA, container)).toThrow(
      /Circular module import detected/,
    );
  });

  it("only visits each module once even when imported multiple times", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class SharedModule {}

    @Module({ imports: [SharedModule] })
    class ModuleX {}

    @Module({ imports: [SharedModule] })
    class ModuleY {}

    @Module({ imports: [ModuleX, ModuleY] })
    class AppModule {}

    // Act
    const graph = walkModuleGraph(AppModule, container);

    // Assert — SharedModule appears once
    expect(graph.size).toBe(4);
    expect(graph.get(SharedModule)).toBeDefined();
  });

  it("defaults exports to empty set when not specified", () => {
    // Arrange
    @Module({ providers: [ServiceA] })
    class NoExportsModule {}

    // Act
    const graph = walkModuleGraph(NoExportsModule, container);

    // Assert
    expect(graph.get(NoExportsModule)!.exports.size).toBe(0);
  });

  it("collects explicit exports", () => {
    // Arrange
    @Module({ providers: [ServiceA, ServiceB], exports: [ServiceA] })
    class SelectiveModule {}

    // Act
    const graph = walkModuleGraph(SelectiveModule, container);

    // Assert
    const node = graph.get(SelectiveModule)!;
    expect(node.exports.has(ServiceA)).toBe(true);
    expect(node.exports.has(ServiceB)).toBe(false);
  });

  it("handles modules without @Module metadata", () => {
    // Arrange
    class PlainClass {}

    // Act
    const graph = walkModuleGraph(PlainClass, container);

    // Assert
    expect(graph.size).toBe(1);
    const node = graph.get(PlainClass)!;
    expect(node.ownTokens.size).toBe(0);
  });
});

describe("validateModuleGraph", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it("passes validation when all deps are in the same module", () => {
    // Arrange
    @Module({ providers: [ServiceA, ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).not.toThrow();
  });

  it("passes when deps are satisfied via exports from imported module", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class SharedModule {}

    @Module({ imports: [SharedModule], providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).not.toThrow();
  });

  it("fails when dep exists in imported module but is not exported", () => {
    // Arrange
    @Module({ providers: [ServiceA] }) // no exports!
    class SharedModule {}

    @Module({ imports: [SharedModule], providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).toThrow(/export/i);
    expect(() => validateModuleGraph(graph, container)).toThrow(/SharedModule/);
  });

  it("fails when dep is not provided anywhere", () => {
    // Arrange
    @Injectable()
    class NeedsMissing {
      constructor(@Inject("MISSING_TOKEN") public dep: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsMissing);

    @Module({ providers: [NeedsMissing] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).toThrow(/MISSING_TOKEN/);
    expect(() => validateModuleGraph(graph, container)).toThrow(/no provider registered/);
  });

  it("auto-adopts unregistered class deps into the consuming module", () => {
    // Arrange — ServiceD depends on ServiceA, but ServiceA is not in any module.
    // Implicit resolution adopts ServiceA into AppModule's visible scope.
    @Module({ providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — ServiceA is implicitly adopted, no error
    expect(() => validateModuleGraph(graph, container)).not.toThrow();
  });

  it("auto-adopted class is scoped — not added to module ownTokens", () => {
    // Arrange — ServiceA is auto-adopted by FeatureModule but not exported.
    // AppModule should NOT be able to see it via FeatureModule.
    @Module({ providers: [ServiceD], exports: [ServiceD] })
    class FeatureModule {}

    @Injectable()
    class NeedsA {
      constructor(public a: ServiceA) {}
    }

    // AppModule imports FeatureModule (which auto-adopted ServiceA internally)
    // but NeedsA also depends on ServiceA. Since ServiceA isn't in any module's
    // ownTokens, NeedsA auto-adopts it independently — both modules get visibility.
    @Module({ imports: [FeatureModule], providers: [NeedsA] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — each module independently auto-adopts, so both pass
    expect(() => validateModuleGraph(graph, container)).not.toThrow();

    // Verify ServiceA was NOT added to any module's ownTokens
    for (const [, node] of graph) {
      expect(node.ownTokens.has(ServiceA)).toBe(false);
    }
  });

  it("validates auto-adopted class's transitive deps against module boundaries", () => {
    // Arrange — ServiceE depends on ServiceA, which is in SharedModule but not exported.
    // Even though ServiceE is auto-adopted, its dep on ServiceA must respect boundaries.
    @Module({ providers: [ServiceA] }) // no exports!
    class SharedModule {}

    @Injectable()
    class ServiceE {
      constructor(public a: ServiceA) {}
    }

    @Injectable()
    class NeedsE {
      constructor(public e: ServiceE) {}
    }

    @Module({ imports: [SharedModule], providers: [NeedsE] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — ServiceE is auto-adopted, but its dep on ServiceA hits
    // the export boundary (ServiceA is in SharedModule but not exported)
    expect(() => validateModuleGraph(graph, container)).toThrow(/SharedModule/);
  });

  it("validates controller dependencies against module boundaries", () => {
    // Arrange
    @Injectable()
    class ControllerDep {
      value = "dep";
    }

    @Module({ providers: [ControllerDep] }) // no exports
    class DepModule {}

    @Controller("/test")
    class TestController {
      constructor(public dep: ControllerDep) {}
    }
    Reflect.defineMetadata("design:paramtypes", [ControllerDep], TestController);

    @Module({ imports: [DepModule], controllers: [TestController] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — ControllerDep is registered in DepModule but not exported.
    // The validator should flag this as an export violation.
    expect(() => validateModuleGraph(graph, container)).toThrow(/DepModule/);
  });

  it("fails when module exports a token it does not own", () => {
    // Arrange
    @Module({ exports: [ServiceA] }) // ServiceA is not in providers
    class BadModule {}

    const graph = walkModuleGraph(BadModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).toThrow(/not provided by this module/);
  });

  it("fails for transitive class token not re-exported — A imports B imports C", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class ModuleC {}

    @Module({ imports: [ModuleC], providers: [ServiceB], exports: [ServiceB] })
    class ModuleB {}

    // AppModule imports ModuleB but NOT ModuleC directly.
    // ServiceA from ModuleC is not re-exported by ModuleB.
    @Module({ imports: [ModuleB], providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — ServiceA is exported from ModuleC but AppModule doesn't import ModuleC
    expect(() => validateModuleGraph(graph, container)).toThrow(/ServiceA/);
    expect(() => validateModuleGraph(graph, container)).toThrow(/ModuleC/);
  });

  it("passes for transitive imports when module is directly imported", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [ServiceA] })
    class ModuleC {}

    @Module({ imports: [ModuleC], providers: [ServiceB], exports: [ServiceB] })
    class ModuleB {}

    // AppModule imports BOTH ModuleB and ModuleC — ServiceA is visible
    @Module({ imports: [ModuleB, ModuleC], providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).not.toThrow();
  });

  it("fails for transitive non-class token that is not re-exported", () => {
    // Arrange
    @Module({
      providers: [{ provide: TOKEN_C, useValue: "c-value" }],
      exports: [TOKEN_C],
    })
    class ModuleC {}

    @Module({ imports: [ModuleC], providers: [ServiceB], exports: [ServiceB] })
    class ModuleB {} // does NOT re-export TOKEN_C

    @Injectable()
    class NeedsC {
      constructor(@Inject(TOKEN_C) public c: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsC);

    @Module({ imports: [ModuleB], providers: [NeedsC] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — TOKEN_C is in ModuleC, exported there, but AppModule
    // only imports ModuleB which doesn't re-export TOKEN_C
    expect(() => validateModuleGraph(graph, container)).toThrow(/TOKEN_C|Symbol\(TOKEN_C\)/);
  });

  it("root module's own providers are always visible to its own controllers", () => {
    // Arrange
    @Controller("/test")
    class TestController {
      constructor(public a: ServiceA) {}
    }
    Reflect.defineMetadata("design:paramtypes", [ServiceA], TestController);

    @Module({ providers: [ServiceA], controllers: [TestController] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).not.toThrow();
  });

  it("empty exports blocks class token dependencies too", () => {
    // Arrange
    @Module({ providers: [ServiceA], exports: [] })
    class SharedModule {}

    @Module({ imports: [SharedModule], providers: [ServiceD] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert — ServiceA is owned by SharedModule but not exported.
    // Class tokens owned by a module respect export boundaries.
    expect(() => validateModuleGraph(graph, container)).toThrow(/SharedModule/);
  });

  it("empty exports blocks non-class token dependencies", () => {
    // Arrange
    @Module({
      providers: [{ provide: TOKEN_C, useValue: "val" }],
      exports: [],
    })
    class SharedModule {}

    @Injectable()
    class NeedsC {
      constructor(@Inject(TOKEN_C) public c: unknown) {}
    }
    Reflect.defineMetadata("design:paramtypes", [Object], NeedsC);

    @Module({ imports: [SharedModule], providers: [NeedsC] })
    class AppModule {}

    const graph = walkModuleGraph(AppModule, container);

    // Act & Assert
    expect(() => validateModuleGraph(graph, container)).toThrow(/SharedModule/);
  });
});
