import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BaseHandlerContext, ServiceContainer } from "@celerity-sdk/types";
import {
  sqlWriterToken,
  sqlReaderToken,
  sqlDatabaseCredentialsToken,
  sqlDatabaseInstanceToken,
  DEFAULT_SQL_WRITER_TOKEN,
  DEFAULT_SQL_READER_TOKEN,
  DEFAULT_SQL_CREDENTIALS_TOKEN,
  DEFAULT_SQL_DATABASE_INSTANCE_TOKEN,
} from "../src/decorators";

// --- Mocks ---

const mockKnex = (label: string) => ({ __knex: true, label, destroy: vi.fn() });
const mockCredentials = (configKey: string) => ({
  __credentials: true,
  configKey,
  getConnectionInfo: vi.fn().mockResolvedValue({
    host: `${configKey}.host`,
    port: 5432,
    database: configKey,
    user: "user",
    engine: "postgres",
    ssl: false,
    authMode: "password",
  }),
  getPasswordAuth: vi.fn().mockResolvedValue({ password: "pass", url: "url" }),
});

vi.mock("../src/credentials", () => ({
  resolveDatabaseCredentials: vi.fn(
    (configKey: string) => Promise.resolve(mockCredentials(configKey)),
  ),
}));

vi.mock("../src/config", () => ({
  captureSqlDatabaseLayerConfig: vi.fn(() => ({ deployTarget: "runtime", platform: "aws" })),
  resolvePoolOverrides: vi.fn(() => Promise.resolve({})),
  resolveTokenProviderFactory: vi.fn(() => Promise.resolve(vi.fn())),
}));

let knexCallCount = 0;
vi.mock("../src/factory", () => ({
  createKnexInstance: vi.fn(() => {
    knexCallCount += 1;
    return Promise.resolve(mockKnex(`knex-${knexCallCount}`));
  }),
}));

vi.mock("@celerity-sdk/config", () => ({
  captureResourceLinks: vi.fn(),
  getLinksOfType: vi.fn(),
  RESOURCE_CONFIG_NAMESPACE: "resources",
}));

import { SqlDatabaseLayer } from "../src/layer";
import { captureResourceLinks, getLinksOfType } from "@celerity-sdk/config";
import { createKnexInstance } from "../src/factory";
import { resolveDatabaseCredentials } from "../src/credentials";

const mockedCaptureResourceLinks = vi.mocked(captureResourceLinks);
const mockedGetLinksOfType = vi.mocked(getLinksOfType);
const mockedCreateKnexInstance = vi.mocked(createKnexInstance);

// --- Helpers ---

function mockContainer(): ServiceContainer & { registered: Map<unknown, unknown> } {
  const registered = new Map<unknown, unknown>();
  return {
    registered,
    resolve: vi.fn().mockImplementation((token: unknown) => {
      if (token === "ConfigService") {
        return Promise.resolve({
          namespace: () => ({
            get: vi.fn().mockResolvedValue(undefined),
            getOrThrow: vi.fn(),
          }),
        });
      }
      return Promise.resolve(registered.get(token));
    }),
    register: vi.fn().mockImplementation((token: unknown, provider: { useValue: unknown }) => {
      registered.set(token, provider.useValue);
    }),
    has: vi.fn().mockReturnValue(false),
    closeAll: vi.fn(),
  };
}

function makeContext(container: ServiceContainer): BaseHandlerContext {
  return { container, metadata: new Map() };
}

// --- Tests ---

describe("SqlDatabaseLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    knexCallCount = 0;
  });

  afterEach(() => {
    delete process.env.CELERITY_RUNTIME;
  });

  it("does nothing when no sqlDatabase resource links exist", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(mockedCreateKnexInstance).not.toHaveBeenCalled();
  });

  it("registers per-resource tokens for a single database resource", async () => {
    const links = new Map([
      ["ordersDb", { type: "sqlDatabase", configKey: "ordersDb" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(new Map([["ordersDb", "ordersDb"]]));

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    // 4 per-resource tokens
    expect(container.register).toHaveBeenCalledWith(
      sqlDatabaseInstanceToken("ordersDb"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      sqlWriterToken("ordersDb"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      sqlReaderToken("ordersDb"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      sqlDatabaseCredentialsToken("ordersDb"),
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
  });

  it("registers default tokens when exactly one resource exists", async () => {
    const links = new Map([
      ["ordersDb", { type: "sqlDatabase", configKey: "ordersDb" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(new Map([["ordersDb", "ordersDb"]]));

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_SQL_WRITER_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_SQL_READER_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_SQL_CREDENTIALS_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
    expect(container.register).toHaveBeenCalledWith(
      DEFAULT_SQL_DATABASE_INSTANCE_TOKEN,
      expect.objectContaining({ useValue: expect.any(Object) }),
    );
  });

  it("does NOT register default tokens when multiple resources exist", async () => {
    const links = new Map([
      ["ordersDb", { type: "sqlDatabase", configKey: "ordersDb" }],
      ["analyticsDb", { type: "sqlDatabase", configKey: "analyticsDb" }],
    ]);
    mockedCaptureResourceLinks.mockReturnValue(links);
    mockedGetLinksOfType.mockReturnValue(
      new Map([
        ["ordersDb", "ordersDb"],
        ["analyticsDb", "analyticsDb"],
      ]),
    );

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const registerCalls = vi.mocked(container.register).mock.calls;
    const defaultCalls = registerCalls.filter(
      ([token]) =>
        token === DEFAULT_SQL_WRITER_TOKEN ||
        token === DEFAULT_SQL_READER_TOKEN ||
        token === DEFAULT_SQL_CREDENTIALS_TOKEN ||
        token === DEFAULT_SQL_DATABASE_INSTANCE_TOKEN,
    );
    expect(defaultCalls).toHaveLength(0);
  });

  it("creates a single Knex instance when no readHost", async () => {
    mockedCaptureResourceLinks.mockReturnValue(
      new Map([["db", { type: "sqlDatabase", configKey: "db" }]]),
    );
    mockedGetLinksOfType.mockReturnValue(new Map([["db", "db"]]));

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    // Only one call to createKnexInstance (no readHost)
    expect(mockedCreateKnexInstance).toHaveBeenCalledTimes(1);
    expect(mockedCreateKnexInstance).toHaveBeenCalledWith(
      expect.not.objectContaining({ useReadHost: true }),
    );
  });

  it("creates two Knex instances when readHost is present", async () => {
    // Override credentials mock to return readHost
    vi.mocked(resolveDatabaseCredentials).mockResolvedValueOnce({
      getConnectionInfo: vi.fn().mockResolvedValue({
        host: "primary.host",
        readHost: "reader.host",
        port: 5432,
        database: "db",
        user: "user",
        engine: "postgres",
        ssl: false,
        authMode: "password",
      }),
      getPasswordAuth: vi.fn().mockResolvedValue({ password: "pass", url: "url" }),
      getIamAuth: vi.fn(),
    });

    mockedCaptureResourceLinks.mockReturnValue(
      new Map([["db", { type: "sqlDatabase", configKey: "db" }]]),
    );
    mockedGetLinksOfType.mockReturnValue(new Map([["db", "db"]]));

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(mockedCreateKnexInstance).toHaveBeenCalledTimes(2);
    expect(mockedCreateKnexInstance).toHaveBeenCalledWith(
      expect.objectContaining({ useReadHost: true }),
    );
  });

  it("initializes only once (idempotent)", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    const next = () => Promise.resolve(undefined);

    await layer.handle(makeContext(container), next);
    await layer.handle(makeContext(container), next);

    expect(mockedCaptureResourceLinks).toHaveBeenCalledTimes(1);
  });

  it("calls next() and returns its result", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    const next = vi.fn().mockResolvedValue("response");

    const result = await layer.handle(makeContext(container), next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("response");
  });

  it("does not resolve ConfigService when no sqlDatabase links exist", async () => {
    mockedCaptureResourceLinks.mockReturnValue(new Map());
    mockedGetLinksOfType.mockReturnValue(new Map());

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    expect(container.resolve).not.toHaveBeenCalledWith("ConfigService");
  });

  it("registers instance with onClose callback", async () => {
    mockedCaptureResourceLinks.mockReturnValue(
      new Map([["db", { type: "sqlDatabase", configKey: "db" }]]),
    );
    mockedGetLinksOfType.mockReturnValue(new Map([["db", "db"]]));

    const container = mockContainer();
    const layer = new SqlDatabaseLayer();
    await layer.handle(makeContext(container), () => Promise.resolve(undefined));

    const instanceCall = vi.mocked(container.register).mock.calls.find(
      ([token]) => token === sqlDatabaseInstanceToken("db"),
    );
    expect(instanceCall).toBeDefined();
    expect(instanceCall![1]).toHaveProperty("onClose");
    expect(typeof instanceCall![1].onClose).toBe("function");
  });
});
