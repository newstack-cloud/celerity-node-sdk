import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Injectable, Inject } from "../../src/decorators/injectable";
import {
  INJECTABLE_METADATA,
  INJECT_METADATA,
} from "../../src/metadata/constants";

describe("@Injectable", () => {
  it("should set INJECTABLE_METADATA to true on the target class", () => {
    // Arrange & Act
    @Injectable()
    class TestService {}

    // Assert
    const isInjectable = Reflect.getOwnMetadata(
      INJECTABLE_METADATA,
      TestService,
    );
    expect(isInjectable).toBe(true);
  });

  it("should not set metadata on an undecorated class", () => {
    // Arrange
    class PlainService {}

    // Act — nothing

    // Assert
    const isInjectable = Reflect.getOwnMetadata(
      INJECTABLE_METADATA,
      PlainService,
    );
    expect(isInjectable).toBeUndefined();
  });

  it("should independently mark multiple classes as injectable", () => {
    // Arrange & Act
    @Injectable()
    class ServiceA {}

    @Injectable()
    class ServiceB {}

    // Assert
    expect(Reflect.getOwnMetadata(INJECTABLE_METADATA, ServiceA)).toBe(true);
    expect(Reflect.getOwnMetadata(INJECTABLE_METADATA, ServiceB)).toBe(true);
  });
});

describe("@Inject", () => {
  it("should store a token for a single constructor parameter", () => {
    // Arrange
    const TOKEN = Symbol("my-token");

    // Act
    class MyService {
      constructor(@Inject(TOKEN) _dep: unknown) {}
    }

    // Assert
    const injectMap: Map<number, unknown> = Reflect.getOwnMetadata(
      INJECT_METADATA,
      MyService,
    );
    expect(injectMap).toBeInstanceOf(Map);
    expect(injectMap.get(0)).toBe(TOKEN);
  });

  it("should store tokens for multiple constructor parameters", () => {
    // Arrange
    const TOKEN_A = Symbol("token-a");
    const TOKEN_B = Symbol("token-b");

    // Act
    class MultiDepService {
      constructor(
        @Inject(TOKEN_A) _a: unknown,
        @Inject(TOKEN_B) _b: unknown,
      ) {}
    }

    // Assert
    const injectMap: Map<number, unknown> = Reflect.getOwnMetadata(
      INJECT_METADATA,
      MultiDepService,
    );
    expect(injectMap).toBeInstanceOf(Map);
    expect(injectMap.size).toBe(2);
    expect(injectMap.get(0)).toBe(TOKEN_A);
    expect(injectMap.get(1)).toBe(TOKEN_B);
  });

  it("should accept string tokens", () => {
    // Arrange & Act
    class StringTokenService {
      constructor(@Inject("DATABASE_URL") _url: unknown) {}
    }

    // Assert
    const injectMap: Map<number, unknown> = Reflect.getOwnMetadata(
      INJECT_METADATA,
      StringTokenService,
    );
    expect(injectMap.get(0)).toBe("DATABASE_URL");
  });

  it("should allow mixing @Inject on some parameters and not others", () => {
    // Arrange
    const TOKEN = Symbol("specific-dep");

    // Act
    class MixedService {
      constructor(
        _plainDep: unknown,
        @Inject(TOKEN) _injectedDep: unknown,
      ) {}
    }

    // Assert
    const injectMap: Map<number, unknown> = Reflect.getOwnMetadata(
      INJECT_METADATA,
      MixedService,
    );
    expect(injectMap).toBeInstanceOf(Map);
    expect(injectMap.size).toBe(1);
    expect(injectMap.has(0)).toBe(false);
    expect(injectMap.get(1)).toBe(TOKEN);
  });

  it("should not have inject metadata on an undecorated class", () => {
    // Arrange
    class NoInjectService {
      constructor(_dep: unknown) {}
    }

    // Act — nothing

    // Assert
    const injectMap = Reflect.getOwnMetadata(INJECT_METADATA, NoInjectService);
    expect(injectMap).toBeUndefined();
  });
});
