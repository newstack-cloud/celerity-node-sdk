import { type Platform, CelerityConfig, type ConfigNamespace } from "@celerity-sdk/config";
import type { ConnectionConfig, DeployTarget, TokenProviderFactory } from "./types";

export type CacheLayerConfig = {
  deployTarget: DeployTarget;
  platform: Platform;
};

/**
 * Captures environment variables once into a typed config object.
 * This is the only place that reads `process.env` for cache layer config.
 */
export function captureCacheLayerConfig(): CacheLayerConfig {
  return {
    deployTarget: process.env.CELERITY_RUNTIME ? "runtime" : "functions",
    platform: CelerityConfig.getPlatform(),
  };
}

// Preset for connection config for FaaS environments.
const FUNCTIONS_CONNECTION: ConnectionConfig = {
  connectTimeoutMs: 5_000,
  commandTimeoutMs: 5_000,
  keepAliveMs: 0,
  maxRetries: 2,
  retryDelayMs: 100,
  lazyConnect: true,
};

// Preset for connection config for the runtime environment
// that assumes long-lived connections.
const RUNTIME_CONNECTION: ConnectionConfig = {
  connectTimeoutMs: 10_000,
  commandTimeoutMs: 0,
  keepAliveMs: 30_000,
  maxRetries: 10,
  retryDelayMs: 500,
  lazyConnect: false,
};

export const CONNECTION_PRESETS: Record<DeployTarget, ConnectionConfig> = {
  functions: FUNCTIONS_CONNECTION,
  runtime: RUNTIME_CONNECTION,
};

const CONNECTION_CONFIG_KEYS: ReadonlyArray<[suffix: string, field: keyof ConnectionConfig]> = [
  ["connectTimeoutMs", "connectTimeoutMs"],
  ["commandTimeoutMs", "commandTimeoutMs"],
  ["keepAliveMs", "keepAliveMs"],
  ["maxRetries", "maxRetries"],
  ["retryDelayMs", "retryDelayMs"],
  ["lazyConnect", "lazyConnect"],
];

export async function resolveConnectionOverrides(
  configKey: string,
  resourceConfig: ConfigNamespace,
): Promise<Partial<ConnectionConfig>> {
  const overrides: Partial<ConnectionConfig> = {};

  for (const [suffix, field] of CONNECTION_CONFIG_KEYS) {
    const value = await resourceConfig.get(`${configKey}_${suffix}`);
    if (value === undefined) continue;

    if (field === "lazyConnect") {
      overrides[field] = value === "true";
    } else {
      overrides[field] = Number.parseInt(value, 10);
    }
  }

  return overrides;
}

export function resolveConnectionConfig(
  deployTarget: DeployTarget,
  configOverrides?: Partial<ConnectionConfig>,
): ConnectionConfig {
  return {
    ...CONNECTION_PRESETS[deployTarget],
    ...configOverrides,
  };
}

export async function resolveTokenProviderFactory(
  platform: Platform,
): Promise<TokenProviderFactory | undefined> {
  if (platform !== "aws") return undefined;

  const mod = await import("./providers/redis/iam/elasticache-token.js");
  return mod.createElastiCacheTokenProviderFactory();
}
