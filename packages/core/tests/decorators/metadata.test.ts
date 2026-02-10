import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { SetMetadata, Action } from "../../src/decorators/metadata";
import { CUSTOM_METADATA } from "../../src/metadata/constants";

describe("@SetMetadata", () => {
  it("should store a key-value pair at class level", () => {
    // Arrange & Act
    @SetMetadata("resource", "posts")
    class PostsController {}

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      PostsController,
    );
    expect(meta).toEqual({ resource: "posts" });
  });

  it("should store a key-value pair at method level", () => {
    // Arrange & Act
    class Handler {
      @SetMetadata("action", "read")
      getItem() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getItem",
    );
    expect(meta).toEqual({ action: "read" });
  });

  it("should accumulate multiple @SetMetadata on the same target", () => {
    // Arrange & Act
    @SetMetadata("resource", "posts")
    @SetMetadata("version", "v2")
    class PostsController {}

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      PostsController,
    );
    expect(meta).toEqual({ resource: "posts", version: "v2" });
  });

  it("should accumulate multiple @SetMetadata on the same method", () => {
    // Arrange & Act
    class Handler {
      @SetMetadata("action", "read")
      @SetMetadata("rateLimit", 100)
      getItem() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getItem",
    );
    expect(meta).toEqual({ action: "read", rateLimit: 100 });
  });

  it("should keep class and method metadata independent", () => {
    // Arrange & Act
    @SetMetadata("resource", "posts")
    class Handler {
      @SetMetadata("action", "read")
      getItem() {}
    }

    // Assert
    const classMeta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler,
    );
    const methodMeta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getItem",
    );
    expect(classMeta).toEqual({ resource: "posts" });
    expect(methodMeta).toEqual({ action: "read" });
  });

  it("should support complex values", () => {
    // Arrange & Act
    class Handler {
      @SetMetadata("permissions", ["posts:read", "posts:list"])
      @SetMetadata("config", { timeout: 30, retry: true })
      list() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "list",
    );
    expect(meta).toEqual({
      permissions: ["posts:read", "posts:list"],
      config: { timeout: 30, retry: true },
    });
  });
});

describe("@Action", () => {
  it("should store under the 'action' key", () => {
    // Arrange & Act
    class Handler {
      @Action("posts:read")
      getPost() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getPost",
    );
    expect(meta).toEqual({ action: "posts:read" });
  });

  it("should support complex action values", () => {
    // Arrange & Act
    const readPostAction = { name: "readPost", permissions: ["posts:read"] };

    class Handler {
      @Action(readPostAction)
      getPost() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getPost",
    );
    expect(meta.action).toEqual(readPostAction);
  });

  it("should compose with other @SetMetadata on the same method", () => {
    // Arrange & Act
    class Handler {
      @Action("posts:read")
      @SetMetadata("rateLimit", 50)
      getPost() {}
    }

    // Assert
    const meta: Record<string, unknown> = Reflect.getOwnMetadata(
      CUSTOM_METADATA,
      Handler.prototype,
      "getPost",
    );
    expect(meta).toEqual({ action: "posts:read", rateLimit: 50 });
  });
});

describe("merge semantics", () => {
  it("should override class-level key with method-level for the same key when merged via spread", () => {
    // Arrange — simulate what HandlerRegistry does
    @SetMetadata("action", "default")
    class Handler {
      @SetMetadata("action", "specific")
      method() {}
    }

    const classMeta: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, Handler) ?? {};
    const methodMeta: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, Handler.prototype, "method") ?? {};

    // Act — merge like the registry does
    const merged = { ...classMeta, ...methodMeta };

    // Assert — method wins
    expect(merged.action).toBe("specific");
  });

  it("should merge different keys from class and method level", () => {
    // Arrange
    @SetMetadata("resource", "posts")
    class Handler {
      @SetMetadata("action", "read")
      method() {}
    }

    const classMeta: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, Handler) ?? {};
    const methodMeta: Record<string, unknown> =
      Reflect.getOwnMetadata(CUSTOM_METADATA, Handler.prototype, "method") ?? {};

    // Act
    const merged = { ...classMeta, ...methodMeta };

    // Assert — both present
    expect(merged).toEqual({ resource: "posts", action: "read" });
  });
});
