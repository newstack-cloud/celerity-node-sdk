import { describe, it, expect, afterEach } from "vitest";
import {
  captureSqlDatabaseLayerConfig,
  POOL_PRESETS,
  resolvePoolOverrides,
  resolvePoolConfig,
} from "../src/config";
import { mockNamespace } from "./test-helpers";

describe("captureSqlDatabaseLayerConfig", () => {
  afterEach(() => {
    delete process.env.CELERITY_RUNTIME;
  });

  it('returns deployTarget "runtime" when CELERITY_RUNTIME is set', () => {
    process.env.CELERITY_RUNTIME = "true";
    const config = captureSqlDatabaseLayerConfig();
    expect(config.deployTarget).toBe("runtime");
  });

  it('returns deployTarget "functions" when CELERITY_RUNTIME is not set', () => {
    delete process.env.CELERITY_RUNTIME;
    const config = captureSqlDatabaseLayerConfig();
    expect(config.deployTarget).toBe("functions");
  });

  it('returns deployTarget "functions" when CELERITY_RUNTIME is empty', () => {
    process.env.CELERITY_RUNTIME = "";
    const config = captureSqlDatabaseLayerConfig();
    expect(config.deployTarget).toBe("functions");
  });
});

describe("POOL_PRESETS", () => {
  it("has conservative FaaS defaults", () => {
    expect(POOL_PRESETS.functions).toEqual({
      min: 0,
      max: 2,
      idleTimeoutMillis: 1_000,
      acquireTimeoutMillis: 10_000,
      createTimeoutMillis: 10_000,
      reapIntervalMillis: 500,
    });
  });

  it("has standard container defaults", () => {
    expect(POOL_PRESETS.runtime).toEqual({
      min: 2,
      max: 10,
      idleTimeoutMillis: 30_000,
      acquireTimeoutMillis: 10_000,
      createTimeoutMillis: 10_000,
      reapIntervalMillis: 1_000,
    });
  });
});

describe("resolvePoolOverrides", () => {
  it("returns empty overrides when no pool keys exist", async () => {
    const ns = mockNamespace({});
    const overrides = await resolvePoolOverrides("ordersDb", ns);
    expect(overrides).toEqual({});
  });

  it("parses all pool override keys", async () => {
    const ns = mockNamespace({
      ordersDb_poolMin: "1",
      ordersDb_poolMax: "5",
      ordersDb_poolIdleTimeoutMs: "5000",
      ordersDb_poolAcquireTimeoutMs: "8000",
      ordersDb_poolCreateTimeoutMs: "7000",
      ordersDb_poolReapIntervalMs: "2000",
    });

    const overrides = await resolvePoolOverrides("ordersDb", ns);
    expect(overrides).toEqual({
      min: 1,
      max: 5,
      idleTimeoutMillis: 5000,
      acquireTimeoutMillis: 8000,
      createTimeoutMillis: 7000,
      reapIntervalMillis: 2000,
    });
  });

  it("returns only set overrides", async () => {
    const ns = mockNamespace({ ordersDb_poolMax: "20" });
    const overrides = await resolvePoolOverrides("ordersDb", ns);
    expect(overrides).toEqual({ max: 20 });
  });
});

describe("resolvePoolConfig", () => {
  it("returns preset when no overrides", () => {
    const config = resolvePoolConfig("functions");
    expect(config).toEqual(POOL_PRESETS.functions);
  });

  it("merges config overrides over preset", () => {
    const config = resolvePoolConfig("runtime", { max: 25 });
    expect(config.max).toBe(25);
    expect(config.min).toBe(POOL_PRESETS.runtime.min);
  });

  it("merges programmatic overrides over config overrides", () => {
    const config = resolvePoolConfig("runtime", { max: 25 }, { max: 50, min: 5 });
    expect(config.max).toBe(50);
    expect(config.min).toBe(5);
  });

  it("applies precedence: programmatic > config > preset", () => {
    const config = resolvePoolConfig(
      "functions",
      { max: 10, idleTimeoutMillis: 5000 },
      { max: 15 },
    );
    expect(config.max).toBe(15);
    expect(config.idleTimeoutMillis).toBe(5000);
    expect(config.min).toBe(POOL_PRESETS.functions.min);
  });
});
