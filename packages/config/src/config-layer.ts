import type { CelerityLayer, HandlerContext, HandlerResponse } from "@celerity-sdk/types";
import type { AwsStoreKind } from "./backends/types";
import { CelerityConfig, DeployTarget, Platform } from "./env";
import { resolveBackend } from "./backends/resolve";
import { ConfigService, ConfigNamespace } from "./config-service";

const CONFIG_SERVICE_TOKEN = "ConfigService";

type ConfigLayerSettings = {
  platform: Platform;
  storeId: string;
  storeKind: string | undefined;
  deployTarget: DeployTarget;
  refreshIntervalMs?: number | null;
  usingExtensionCache: boolean;
};

/**
 * System layer that initializes the ConfigService on first request
 * and registers it in the DI container.
 *
 * Self-configuring: reads store ID, store kind, and refresh interval
 * from environment variables set by the deploy engine.
 */
export class ConfigLayer implements CelerityLayer {
  private initialized = false;
  private settings: ConfigLayerSettings | null = null;

  async handle(
    context: HandlerContext,
    next: () => Promise<HandlerResponse>,
  ): Promise<HandlerResponse> {
    if (!this.initialized) {
      const platform = CelerityConfig.getPlatform();
      this.settings = captureConfigLayerSettings(platform);
      const service = buildConfigService(this.settings);

      context.container.register(CONFIG_SERVICE_TOKEN, { useValue: service });
      this.initialized = true;
    }

    return next();
  }
}

function captureConfigLayerSettings(platform: Platform): ConfigLayerSettings {
  const storeId = process.env.CELERITY_CONFIG_STORE_ID;
  const storeKind = process.env.CELERITY_CONFIG_STORE_KIND;

  const settings: ConfigLayerSettings = {
    platform,
    storeId: storeId ?? "",
    storeKind,
    deployTarget: process.env.CELERITY_RUNTIME ? "runtime" : "functions",
    usingExtensionCache: !!process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT,
  };

  settings.refreshIntervalMs = resolveRefreshInterval(
    settings,
    process.env.CELERITY_CONFIG_REFRESH_INTERVAL_MS,
  );

  return settings;
}

function buildConfigService(settings: ConfigLayerSettings): ConfigService {
  const service = new ConfigService();
  const namespaces = discoverNamespaces(settings);

  if (namespaces.length === 0) {
    return service;
  }

  for (const ns of namespaces) {
    const storeKind = (ns.storeKind ?? "secrets-manager") as AwsStoreKind;
    const backend = resolveBackend(settings.platform, storeKind);
    const namespace = new ConfigNamespace(backend, ns.storeId, settings.refreshIntervalMs);
    service.registerNamespace(ns.name, namespace);
  }

  return service;
}

type DiscoveredNamespace = {
  name: string;
  storeId: string;
  storeKind: string | undefined;
};

/**
 * Discovers config namespaces from environment variables.
 * Single namespace: CELERITY_CONFIG_STORE_ID
 * Multiple: CELERITY_CONFIG_<NS>_STORE_ID
 */
function discoverNamespaces(settings: ConfigLayerSettings): DiscoveredNamespace[] {
  const defaultStoreId = settings.storeId;
  if (defaultStoreId) {
    return [
      {
        name: "default",
        storeId: defaultStoreId,
        storeKind: settings.storeKind,
      },
    ];
  }

  const prefix = "CELERITY_CONFIG_";
  const suffix = "_STORE_ID";
  const namespaces: DiscoveredNamespace[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix) || !value) continue;

    const nsName = key.slice(prefix.length, key.length - suffix.length);
    if (!nsName || nsName === "STORE") continue;

    namespaces.push({
      name: nsName.toLowerCase(),
      storeId: value,
      storeKind: process.env[`${prefix}${nsName}_STORE_KIND`],
    });
  }

  return namespaces;
}

function resolveRefreshInterval(
  settings: ConfigLayerSettings,
  refreshIntervalFromEnv?: string,
): number | null {
  if (typeof refreshIntervalFromEnv !== "undefined") {
    const ms = Number.parseInt(refreshIntervalFromEnv);
    return ms === 0 ? null : ms;
  }

  if (
    settings.platform === "aws" &&
    settings.deployTarget === "functions" &&
    settings.usingExtensionCache &&
    (settings.storeKind ?? "secrets-manager") === "secrets-manager"
  ) {
    return null;
  }

  return 30_000;
}
