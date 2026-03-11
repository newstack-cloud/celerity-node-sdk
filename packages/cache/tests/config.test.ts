import { describe, it, expect, vi, afterEach } from "vitest";
import type { ConfigNamespace } from "@celerity-sdk/config";
import {
  captureCacheLayerConfig,
  CONNECTION_PRESETS,
  resolveConnectionOverrides,
  resolveConnectionConfig,
} from "../src/config";

vi.mock("@celerity-sdk/config", () => ({
  CelerityConfig: {
    getPlatform: vi.fn(() => "aws"),
  },
}));

afterEach(() => {
  delete process.env.CELERITY_RUNTIME;
});

describe("captureCacheLayerConfig", () => {
  it('returns deployTarget "runtime" when CELERITY_RUNTIME is set', () => {
    process.env.CELERITY_RUNTIME = "true";
    const config = captureCacheLayerConfig();
    expect(config.deployTarget).toBe("runtime");
  });

  it('returns deployTarget "functions" when CELERITY_RUNTIME is not set', () => {
    const config = captureCacheLayerConfig();
    expect(config.deployTarget).toBe("functions");
  });

  it("captures platform from CelerityConfig", () => {
    const config = captureCacheLayerConfig();
    expect(config.platform).toBe("aws");
  });
});

describe("CONNECTION_PRESETS", () => {
  it("has a functions preset with lazy connect", () => {
    expect(CONNECTION_PRESETS.functions.lazyConnect).toBe(true);
    expect(CONNECTION_PRESETS.functions.connectTimeoutMs).toBe(5_000);
    expect(CONNECTION_PRESETS.functions.commandTimeoutMs).toBe(5_000);
    expect(CONNECTION_PRESETS.functions.maxRetries).toBe(2);
  });

  it("has a runtime preset with eager connect", () => {
    expect(CONNECTION_PRESETS.runtime.lazyConnect).toBe(false);
    expect(CONNECTION_PRESETS.runtime.connectTimeoutMs).toBe(10_000);
    expect(CONNECTION_PRESETS.runtime.commandTimeoutMs).toBe(0);
    expect(CONNECTION_PRESETS.runtime.maxRetries).toBe(10);
  });
});

describe("resolveConnectionOverrides", () => {
  function mockNamespace(values: Record<string, string | undefined>): ConfigNamespace {
    return {
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
      getOrThrow: vi.fn(),
      getAll: vi.fn(),
      parse: vi.fn(),
    };
  }

  it("returns an empty object when no overrides are set", async () => {
    const ns = mockNamespace({});
    const overrides = await resolveConnectionOverrides("myCache", ns);
    expect(overrides).toEqual({});
  });

  it("resolves numeric overrides from config", async () => {
    const ns = mockNamespace({
      myCache_connectTimeoutMs: "3000",
      myCache_commandTimeoutMs: "2000",
      myCache_maxRetries: "5",
    });

    const overrides = await resolveConnectionOverrides("myCache", ns);

    expect(overrides.connectTimeoutMs).toBe(3000);
    expect(overrides.commandTimeoutMs).toBe(2000);
    expect(overrides.maxRetries).toBe(5);
  });

  it("resolves boolean lazyConnect override", async () => {
    const ns = mockNamespace({ myCache_lazyConnect: "true" });
    const overrides = await resolveConnectionOverrides("myCache", ns);
    expect(overrides.lazyConnect).toBe(true);
  });

  it("resolves lazyConnect false", async () => {
    const ns = mockNamespace({ myCache_lazyConnect: "false" });
    const overrides = await resolveConnectionOverrides("myCache", ns);
    expect(overrides.lazyConnect).toBe(false);
  });
});

describe("resolveConnectionConfig", () => {
  it("returns the preset for the deploy target when no overrides", () => {
    const config = resolveConnectionConfig("functions");
    expect(config).toEqual(CONNECTION_PRESETS.functions);
  });

  it("merges overrides on top of the preset", () => {
    const config = resolveConnectionConfig("functions", { connectTimeoutMs: 1000 });
    expect(config.connectTimeoutMs).toBe(1000);
    expect(config.lazyConnect).toBe(true); // from preset
  });

  it("prefers overrides over preset values", () => {
    const config = resolveConnectionConfig("runtime", {
      lazyConnect: true,
      maxRetries: 3,
    });
    expect(config.lazyConnect).toBe(true);
    expect(config.maxRetries).toBe(3);
    expect(config.connectTimeoutMs).toBe(10_000); // from preset
  });
});
