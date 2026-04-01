import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpRequest, HttpResponse } from "@celerity-sdk/types";
import type { MockFn } from "../src/mocks";

const { mockContainer, mockRegistry, mockTestingApp } = vi.hoisted(() => {
  const mockContainer = {
    registerValue: vi.fn(),
    registerClass: vi.fn(),
    register: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    resolve: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockRegistry = {
    getAllHandlers: vi.fn().mockReturnValue([]),
  };

  const mockTestingApp = {
    injectHttp: vi.fn(),
    injectWebSocket: vi.fn(),
    injectConsumer: vi.fn(),
    injectSchedule: vi.fn(),
    injectCustom: vi.fn(),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    getRegistry: vi.fn().mockReturnValue(mockRegistry),
  };

  return { mockContainer, mockRegistry, mockTestingApp };
});

vi.mock("../src/discovery", () => ({
  discoverResourceTokens: vi.fn().mockReturnValue([]),
}));

vi.mock("../src/blueprint", () => ({
  loadBlueprintResources: vi.fn().mockReturnValue(new Map()),
}));

vi.mock("../src/mocks", () => ({
  createMocksForTokens: vi.fn().mockReturnValue(new Map()),
}));

vi.mock("../src/clients", () => ({
  createRealClients: vi.fn().mockResolvedValue({ handles: new Map(), closeables: [] }),
}));

vi.mock("@celerity-sdk/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@celerity-sdk/core")>();
  return {
    ...original,
    CelerityFactory: {
      createTestingApp: vi.fn().mockResolvedValue(mockTestingApp),
    },
  };
});

// Import after mocks are set up
const { TestApp, createTestApp } = await import("../src/test-app");

beforeEach(() => {
  vi.clearAllMocks();
  mockContainer.has.mockReturnValue(false);
  mockTestingApp.getContainer.mockReturnValue(mockContainer);
  mockTestingApp.getRegistry.mockReturnValue(mockRegistry);
});

describe("TestApp", () => {
  function buildTestApp(
    mocks = new Map<symbol, Record<string, MockFn>>(),
    closeables: Array<{ close?(): void | Promise<void> }> = [],
  ): InstanceType<typeof TestApp> {
    return new TestApp(mockTestingApp as never, mocks, closeables);
  }

  describe("delegation to TestingApplication", () => {
    it("should delegate injectHttp", async () => {
      const expected: HttpResponse = { status: 200, body: "ok" };
      mockTestingApp.injectHttp.mockResolvedValue(expected);

      const app = buildTestApp();
      const result = await app.injectHttp({ method: "GET", path: "/" } as HttpRequest);
      expect(result).toBe(expected);
      expect(mockTestingApp.injectHttp).toHaveBeenCalledWith({ method: "GET", path: "/" });
    });

    it("should delegate injectWebSocket", async () => {
      const app = buildTestApp();
      await app.injectWebSocket("/ws", { data: "test" } as never);
      expect(mockTestingApp.injectWebSocket).toHaveBeenCalledWith("/ws", { data: "test" });
    });

    it("should delegate injectConsumer", async () => {
      const app = buildTestApp();
      await app.injectConsumer("handler-tag", { body: {} } as never);
      expect(mockTestingApp.injectConsumer).toHaveBeenCalledWith("handler-tag", { body: {} });
    });

    it("should delegate injectSchedule", async () => {
      const app = buildTestApp();
      await app.injectSchedule("schedule-tag", {} as never);
      expect(mockTestingApp.injectSchedule).toHaveBeenCalled();
    });

    it("should delegate injectCustom", async () => {
      const app = buildTestApp();
      await app.injectCustom("myHandler", { data: 1 });
      expect(mockTestingApp.injectCustom).toHaveBeenCalledWith("myHandler", { data: 1 });
    });

    it("should delegate getContainer", () => {
      const app = buildTestApp();
      expect(app.getContainer()).toBe(mockContainer);
    });

    it("should delegate getRegistry", () => {
      const app = buildTestApp();
      expect(app.getRegistry()).toBe(mockRegistry);
    });
  });

  describe("getMock", () => {
    it("should return mock for a known token", () => {
      const token = Symbol.for("celerity:datastore:users");
      const mock = { getItem: vi.fn(), putItem: vi.fn() } as unknown as Record<string, MockFn>;
      const mocks = new Map<symbol, Record<string, MockFn>>([[token, mock]]);

      const app = buildTestApp(mocks);
      expect(app.getMock(token)).toBe(mock);
    });

    it("should throw for unknown token", () => {
      const app = buildTestApp();
      expect(() => app.getMock(Symbol.for("celerity:datastore:unknown"))).toThrow(
        "No mock found for token",
      );
    });
  });

  describe("named mock getters", () => {
    it("should get datastore mock by name", () => {
      const token = Symbol.for("celerity:datastore:users");
      const mock = { getItem: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getDatastoreMock("users")).toBe(mock);
    });

    it("should get topic mock by name", () => {
      const token = Symbol.for("celerity:topic:events");
      const mock = { publish: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getTopicMock("events")).toBe(mock);
    });

    it("should get queue mock by name", () => {
      const token = Symbol.for("celerity:queue:jobs");
      const mock = { sendMessage: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getQueueMock("jobs")).toBe(mock);
    });

    it("should get cache mock by name", () => {
      const token = Symbol.for("celerity:cache:session");
      const mock = { get: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getCacheMock("session")).toBe(mock);
    });

    it("should get bucket mock by name", () => {
      const token = Symbol.for("celerity:bucket:uploads");
      const mock = { get: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getBucketMock("uploads")).toBe(mock);
    });

    it("should get config mock by name", () => {
      const token = Symbol.for("celerity:config:app");
      const mock = { get: vi.fn() } as unknown as Record<string, MockFn>;
      const app = buildTestApp(new Map([[token, mock]]));
      expect(app.getConfigMock("app")).toBe(mock);
    });
  });

  describe("close", () => {
    it("should call close on all closeables", async () => {
      const close1 = vi.fn();
      const close2 = vi.fn();
      const app = buildTestApp(new Map(), [{ close: close1 }, { close: close2 }]);

      await app.close();

      expect(close1).toHaveBeenCalled();
      expect(close2).toHaveBeenCalled();
    });

    it("should handle closeables without close method", async () => {
      const app = buildTestApp(new Map(), [{}, { close: vi.fn() }]);
      await expect(app.close()).resolves.toBeUndefined();
    });

    it("should swallow errors during close", async () => {
      const failingClose = vi.fn().mockRejectedValue(new Error("close failed"));
      const app = buildTestApp(new Map(), [{ close: failingClose }]);

      await expect(app.close()).resolves.toBeUndefined();
    });

    it("should be a no-op when no closeables", async () => {
      const app = buildTestApp();
      await expect(app.close()).resolves.toBeUndefined();
    });
  });
});

describe("createTestApp", () => {
  it("should create a TestApp in unit mode by default", async () => {
    const { Module } = await import("@celerity-sdk/core");

    @Module({})
    class TestModule {}

    const app = await createTestApp({ module: TestModule });
    expect(app).toBeInstanceOf(TestApp);
  });

  it("should register overrides with symbol keys", async () => {
    const { Module } = await import("@celerity-sdk/core");

    @Module({})
    class TestModule {}

    const token = Symbol.for("celerity:datastore:users");
    const overrideMock = { getItem: vi.fn() };

    await createTestApp({
      module: TestModule,
      overrides: { [token]: overrideMock },
    });

    expect(mockContainer.registerValue).toHaveBeenCalledWith(token, overrideMock);
  });

  it("should register additional class providers", async () => {
    const { Module, Injectable } = await import("@celerity-sdk/core");

    @Injectable()
    class ExtraService {}

    @Module({})
    class TestModule {}

    await createTestApp({
      module: TestModule,
      providers: [ExtraService],
    });

    expect(mockContainer.registerClass).toHaveBeenCalledWith(ExtraService);
  });

  it("should register additional object providers", async () => {
    const { Module } = await import("@celerity-sdk/core");

    @Module({})
    class TestModule {}

    const token = Symbol("custom");
    await createTestApp({
      module: TestModule,
      providers: [{ provide: token, useValue: "test-value" }],
    });

    expect(mockContainer.register).toHaveBeenCalledWith(token, {
      provide: token,
      useValue: "test-value",
    });
  });

  it("should register additional controllers", async () => {
    const { Module } = await import("@celerity-sdk/core");

    class MyController {}

    @Module({})
    class TestModule {}

    await createTestApp({
      module: TestModule,
      controllers: [MyController],
    });

    expect(mockContainer.registerClass).toHaveBeenCalledWith(MyController);
  });

  it("should not re-register controllers already in container", async () => {
    const { Module } = await import("@celerity-sdk/core");

    class ExistingController {}
    mockContainer.has.mockReturnValue(true);

    @Module({})
    class TestModule {}

    await createTestApp({
      module: TestModule,
      controllers: [ExistingController],
    });

    expect(mockContainer.registerClass).not.toHaveBeenCalledWith(ExistingController);
  });

  it("should register additional guards", async () => {
    const { Module } = await import("@celerity-sdk/core");

    class MyGuard {}

    @Module({})
    class TestModule {}

    await createTestApp({
      module: TestModule,
      guards: [MyGuard],
    });

    expect(mockContainer.registerClass).toHaveBeenCalledWith(MyGuard);
  });
});
