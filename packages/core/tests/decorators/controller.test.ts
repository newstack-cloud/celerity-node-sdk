import "reflect-metadata";
import { describe, it, expect } from "vitest";
import {
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Head,
  Options,
} from "../../src/decorators/http";
import { Controller } from "../../src/decorators/controller";
import {
  HTTP_METHOD_METADATA,
  ROUTE_PATH_METADATA,
  CONTROLLER_METADATA,
  INJECTABLE_METADATA,
} from "../../src/metadata/constants";
import type { ControllerMetadata } from "../../src/decorators/controller";

// ---------------------------------------------------------------------------
// @Controller
// ---------------------------------------------------------------------------

describe("@Controller", () => {
  it("should store controller metadata", () => {
    // Arrange & Act
    @Controller()
    class UserController {}

    // Assert
    const meta: ControllerMetadata = Reflect.getOwnMetadata(
      CONTROLLER_METADATA,
      UserController,
    );
    expect(meta).toBeDefined();
  });

  it("should store the provided prefix", () => {
    // Arrange & Act
    @Controller("/api/users")
    class UserController {}

    // Assert
    const meta: ControllerMetadata = Reflect.getOwnMetadata(
      CONTROLLER_METADATA,
      UserController,
    );
    expect(meta.prefix).toBe("/api/users");
  });

  it("should not set prefix when none is provided", () => {
    // Arrange & Act
    @Controller()
    class NoPrefixController {}

    // Assert
    const meta: ControllerMetadata = Reflect.getOwnMetadata(
      CONTROLLER_METADATA,
      NoPrefixController,
    );
    expect(meta.prefix).toBeUndefined();
  });

  it("should also mark the class as injectable", () => {
    // Arrange & Act
    @Controller("/items")
    class ItemController {}

    // Assert
    const isInjectable = Reflect.getOwnMetadata(
      INJECTABLE_METADATA,
      ItemController,
    );
    expect(isInjectable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP method decorators: @Get, @Post, @Put, @Patch, @Delete, @Head, @Options
// ---------------------------------------------------------------------------

describe("@Get", () => {
  it("should store HTTP_METHOD_METADATA as 'GET'", () => {
    // Arrange
    class Handler {
      @Get("/items")
      list() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "list",
    );

    // Assert
    expect(method).toBe("GET");
  });

  it("should store the route path", () => {
    // Arrange
    class Handler {
      @Get("/items/{id}")
      getOne() {}
    }

    // Act
    const path = Reflect.getOwnMetadata(
      ROUTE_PATH_METADATA,
      Handler.prototype,
      "getOne",
    );

    // Assert
    expect(path).toBe("/items/{id}");
  });

  it("should default path to '/' when no path is given", () => {
    // Arrange
    class Handler {
      @Get()
      index() {}
    }

    // Act
    const path = Reflect.getOwnMetadata(
      ROUTE_PATH_METADATA,
      Handler.prototype,
      "index",
    );

    // Assert
    expect(path).toBe("/");
  });
});

describe("@Post", () => {
  it("should store HTTP method as 'POST' with path", () => {
    // Arrange
    class Handler {
      @Post("/items")
      create() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "create",
    );
    const path = Reflect.getOwnMetadata(
      ROUTE_PATH_METADATA,
      Handler.prototype,
      "create",
    );

    // Assert
    expect(method).toBe("POST");
    expect(path).toBe("/items");
  });
});

describe("@Put", () => {
  it("should store HTTP method as 'PUT' with path", () => {
    // Arrange
    class Handler {
      @Put("/items/{id}")
      update() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "update",
    );

    // Assert
    expect(method).toBe("PUT");
  });
});

describe("@Patch", () => {
  it("should store HTTP method as 'PATCH' with path", () => {
    // Arrange
    class Handler {
      @Patch("/items/{id}")
      patch() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "patch",
    );

    // Assert
    expect(method).toBe("PATCH");
  });
});

describe("@Delete", () => {
  it("should store HTTP method as 'DELETE' with path", () => {
    // Arrange
    class Handler {
      @Delete("/items/{id}")
      remove() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "remove",
    );

    // Assert
    expect(method).toBe("DELETE");
  });
});

describe("@Head", () => {
  it("should store HTTP method as 'HEAD' with path", () => {
    // Arrange
    class Handler {
      @Head("/items")
      head() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "head",
    );

    // Assert
    expect(method).toBe("HEAD");
  });
});

describe("@Options", () => {
  it("should store HTTP method as 'OPTIONS' with path", () => {
    // Arrange
    class Handler {
      @Options("/items")
      options() {}
    }

    // Act
    const method = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      Handler.prototype,
      "options",
    );

    // Assert
    expect(method).toBe("OPTIONS");
  });
});

describe("multiple methods on the same controller class", () => {
  it("should store independent metadata for each decorated method", () => {
    // Arrange
    class MultiHandler {
      @Get("/")
      list() {}

      @Post("/")
      create() {}

      @Delete("/{id}")
      remove() {}
    }

    // Act
    const listMethod = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      MultiHandler.prototype,
      "list",
    );
    const createMethod = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      MultiHandler.prototype,
      "create",
    );
    const removeMethod = Reflect.getOwnMetadata(
      HTTP_METHOD_METADATA,
      MultiHandler.prototype,
      "remove",
    );
    const removePath = Reflect.getOwnMetadata(
      ROUTE_PATH_METADATA,
      MultiHandler.prototype,
      "remove",
    );

    // Assert
    expect(listMethod).toBe("GET");
    expect(createMethod).toBe("POST");
    expect(removeMethod).toBe("DELETE");
    expect(removePath).toBe("/{id}");
  });
});
