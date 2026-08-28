import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { getClassDependencyTokens } from "../../src/di/dependency-tokens";
import { Injectable, Inject } from "../../src/decorators/injectable";

@Injectable()
class Logger {}

@Injectable()
class Database {}

const CONFIG = Symbol.for("celerity:test:config");

describe("getClassDependencyTokens", () => {
  it("resolves tokens from emitted parameter types", () => {
    @Injectable()
    class Service {
      constructor(
        readonly logger: Logger,
        readonly db: Database,
      ) {}
    }

    expect(getClassDependencyTokens(Service)).toEqual([Logger, Database]);
  });

  it("prefers an @Inject() token over the emitted parameter type", () => {
    @Injectable()
    class Service {
      constructor(@Inject(CONFIG) readonly config: unknown) {}
    }

    expect(getClassDependencyTokens(Service)).toEqual([CONFIG]);
  });

  // esbuild does not implement emitDecoratorMetadata, so under tsx and similar
  // tooling design:paramtypes is absent however tsconfig is set. Explicit
  // @Inject() tokens have to carry the graph on their own there.
  it("resolves @Inject() tokens when no parameter types were emitted", () => {
    @Injectable()
    class Service {
      constructor(
        @Inject(Logger) readonly logger: Logger,
        @Inject(Database) readonly db: Database,
      ) {}
    }

    Reflect.deleteMetadata("design:paramtypes", Service);

    expect(getClassDependencyTokens(Service)).toEqual([Logger, Database]);
  });

  it("keeps positions aligned when only later parameters are injected", () => {
    @Injectable()
    class Service {
      constructor(
        readonly logger: Logger,
        @Inject(CONFIG) readonly config: unknown,
      ) {}
    }

    Reflect.deleteMetadata("design:paramtypes", Service);

    // The first position has neither an emitted type nor an @Inject() token,
    // so it cannot be resolved and is omitted rather than reported undefined.
    expect(getClassDependencyTokens(Service)).toEqual([CONFIG]);
  });

  it("returns no tokens for a class with no constructor dependencies", () => {
    @Injectable()
    class Service {}

    expect(getClassDependencyTokens(Service)).toEqual([]);
  });
});
