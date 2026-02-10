import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Guard, ProtectedBy, Public } from "../../src/decorators/guards";
import {
  GUARD_CUSTOM_METADATA,
  GUARD_PROTECTEDBY_METADATA,
  PUBLIC_METADATA,
} from "../../src/metadata/constants";

// ---------------------------------------------------------------------------
// @Guard — class-level, string-based (handler IS a custom guard)
// ---------------------------------------------------------------------------

describe("@Guard (class-level)", () => {
  it("should store the custom guard name on the class", () => {
    // Arrange & Act
    @Guard("myAuth")
    class CustomGuardHandler {
      handle() {}
    }

    // Assert
    const name = Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, CustomGuardHandler);
    expect(name).toBe("myAuth");
  });

  it("should not have guard metadata on an undecorated class", () => {
    // Arrange
    class PlainHandler {
      handle() {}
    }

    // Act — nothing

    // Assert
    const name = Reflect.getOwnMetadata(GUARD_CUSTOM_METADATA, PlainHandler);
    expect(name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @ProtectedBy — class-level
// ---------------------------------------------------------------------------

describe("@ProtectedBy (class-level)", () => {
  it("should store a single protectedBy guard name on the class", () => {
    // Arrange & Act
    @ProtectedBy("jwt")
    class Handler {
      handle() {}
    }

    // Assert
    const guards = Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, Handler);
    expect(guards).toEqual(["jwt"]);
  });

  it("should accumulate multiple @ProtectedBy in declaration order", () => {
    // Arrange & Act
    @ProtectedBy("jwt")
    @ProtectedBy("rbac")
    class Handler {
      handle() {}
    }

    // Assert — declaration order: jwt first, rbac second
    const guards = Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, Handler);
    expect(guards).toEqual(["jwt", "rbac"]);
  });

  it("should not have protectedBy metadata on an undecorated class", () => {
    // Arrange
    class PlainHandler {
      handle() {}
    }

    // Assert
    const guards = Reflect.getOwnMetadata(GUARD_PROTECTEDBY_METADATA, PlainHandler);
    expect(guards).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// @ProtectedBy — method-level
// ---------------------------------------------------------------------------

describe("@ProtectedBy (method-level)", () => {
  it("should store a guard on a specific method", () => {
    // Arrange & Act
    class Handler {
      @ProtectedBy("jwt")
      secretRoute() {}

      publicRoute() {}
    }

    // Assert
    const methodGuards = Reflect.getOwnMetadata(
      GUARD_PROTECTEDBY_METADATA,
      Handler.prototype,
      "secretRoute",
    );
    expect(methodGuards).toEqual(["jwt"]);

    const publicGuards = Reflect.getOwnMetadata(
      GUARD_PROTECTEDBY_METADATA,
      Handler.prototype,
      "publicRoute",
    );
    expect(publicGuards).toBeUndefined();
  });

  it("should accumulate multiple @ProtectedBy on a method in declaration order", () => {
    // Arrange & Act
    class Handler {
      @ProtectedBy("jwt")
      @ProtectedBy("rbac")
      admin() {}
    }

    // Assert — declaration order: jwt first, rbac second
    const guards = Reflect.getOwnMetadata(
      GUARD_PROTECTEDBY_METADATA,
      Handler.prototype,
      "admin",
    );
    expect(guards).toEqual(["jwt", "rbac"]);
  });
});

// ---------------------------------------------------------------------------
// @Public
// ---------------------------------------------------------------------------

describe("@Public", () => {
  it("should set PUBLIC_METADATA to true on the decorated method", () => {
    // Arrange & Act
    class Handler {
      @Public()
      health() {}
    }

    // Assert
    const isPublic = Reflect.getOwnMetadata(
      PUBLIC_METADATA,
      Handler.prototype,
      "health",
    );
    expect(isPublic).toBe(true);
  });

  it("should not set PUBLIC_METADATA on non-decorated methods", () => {
    // Arrange & Act
    class Handler {
      @Public()
      health() {}

      secret() {}
    }

    // Assert
    const secretPublic = Reflect.getOwnMetadata(
      PUBLIC_METADATA,
      Handler.prototype,
      "secret",
    );
    expect(secretPublic).toBeUndefined();
  });

  it("should coexist with @ProtectedBy on different methods", () => {
    // Arrange & Act
    class Handler {
      @ProtectedBy("jwt")
      admin() {}

      @Public()
      health() {}
    }

    // Assert
    const adminGuards = Reflect.getOwnMetadata(
      GUARD_PROTECTEDBY_METADATA,
      Handler.prototype,
      "admin",
    );
    expect(adminGuards).toEqual(["jwt"]);

    const healthPublic = Reflect.getOwnMetadata(
      PUBLIC_METADATA,
      Handler.prototype,
      "health",
    );
    expect(healthPublic).toBe(true);

    // Ensure the admin method is not public
    const adminPublic = Reflect.getOwnMetadata(
      PUBLIC_METADATA,
      Handler.prototype,
      "admin",
    );
    expect(adminPublic).toBeUndefined();
  });
});
