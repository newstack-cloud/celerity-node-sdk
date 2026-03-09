import { type Platform, CelerityConfig, type ConfigNamespace } from "@celerity-sdk/config";
import type { DeployTarget, PoolConfig, TokenProviderFactory } from "./types";

export type SqlDatabaseLayerConfig = {
  deployTarget: DeployTarget;
  platform: Platform;
};

export function captureSqlDatabaseLayerConfig(): SqlDatabaseLayerConfig {
  return {
    deployTarget: process.env.CELERITY_RUNTIME ? "runtime" : "functions",
    platform: CelerityConfig.getPlatform(),
  };
}

export async function resolveTokenProviderFactory(
  platform: Platform,
): Promise<TokenProviderFactory | undefined> {
  if (platform !== "aws") return undefined;

  const mod = await import("./rds-token-provider");
  return mod.createRdsTokenProviderFactory();
}

const FUNCTIONS_POOL: PoolConfig = {
  min: 0,
  max: 2,
  idleTimeoutMillis: 1_000,
  acquireTimeoutMillis: 10_000,
  createTimeoutMillis: 10_000,
  reapIntervalMillis: 500,
};

const RUNTIME_POOL: PoolConfig = {
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  acquireTimeoutMillis: 10_000,
  createTimeoutMillis: 10_000,
  reapIntervalMillis: 1_000,
};

export const POOL_PRESETS: Record<DeployTarget, PoolConfig> = {
  functions: FUNCTIONS_POOL,
  runtime: RUNTIME_POOL,
};

const POOL_CONFIG_KEYS: ReadonlyArray<[suffix: string, field: keyof PoolConfig]> = [
  ["poolMin", "min"],
  ["poolMax", "max"],
  ["poolIdleTimeoutMs", "idleTimeoutMillis"],
  ["poolAcquireTimeoutMs", "acquireTimeoutMillis"],
  ["poolCreateTimeoutMs", "createTimeoutMillis"],
  ["poolReapIntervalMs", "reapIntervalMillis"],
];

export async function resolvePoolOverrides(
  configKey: string,
  resourceConfig: ConfigNamespace,
): Promise<Partial<PoolConfig>> {
  const overrides: Partial<PoolConfig> = {};

  for (const [suffix, field] of POOL_CONFIG_KEYS) {
    const value = await resourceConfig.get(`${configKey}_${suffix}`);
    if (value !== undefined) {
      overrides[field] = Number.parseInt(value, 10);
    }
  }

  return overrides;
}

export function resolvePoolConfig(
  deployTarget: DeployTarget,
  configOverrides?: Partial<PoolConfig>,
  programmaticOverrides?: Partial<PoolConfig>,
): PoolConfig {
  return {
    ...POOL_PRESETS[deployTarget],
    ...configOverrides,
    ...programmaticOverrides,
  };
}
