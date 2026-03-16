import createDebug from "debug";
import type {
  CelerityLayer,
  BaseHandlerContext,
  CelerityTracer,
  ServiceContainer,
} from "@celerity-sdk/types";
import { TRACER_TOKEN, CONFIG_SERVICE_TOKEN } from "@celerity-sdk/common";
import {
  type ConfigService,
  type ConfigNamespace,
  captureResourceLinks,
  getLinksOfType,
  RESOURCE_CONFIG_NAMESPACE,
} from "@celerity-sdk/config";
import type { CacheLayerConfig } from "./config";
import type { TokenProviderFactory } from "./types";
import {
  captureCacheLayerConfig,
  resolveConnectionOverrides,
  resolveConnectionConfig,
  resolveTokenProviderFactory,
} from "./config";
import { resolveCacheCredentials } from "./credentials";
import { createCacheClient } from "./factory";
import type { RedisCacheConfig } from "./providers/redis/types";
import {
  cacheToken,
  cacheCredentialsToken,
  cacheClientToken,
  DEFAULT_CACHE_TOKEN,
  DEFAULT_CACHE_CREDENTIALS_TOKEN,
} from "./decorators";

const debug = createDebug("celerity:cache");

/**
 * System layer that auto-registers per-resource {@link Cache} and
 * {@link CacheCredentials} handles in the DI container.
 *
 * Reads resource link topology from `CELERITY_RESOURCE_LINKS` and resolves
 * connection config from the ConfigService "resources" namespace.
 * Must run after ConfigLayer in the layer pipeline.
 */
export class CacheLayer implements CelerityLayer<BaseHandlerContext> {
  private initialized = false;
  private config: CacheLayerConfig | null = null;

  async handle(context: BaseHandlerContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.initialized) {
      this.config = captureCacheLayerConfig();

      const links = captureResourceLinks();
      const cacheLinks = getLinksOfType(links, "cache");

      if (cacheLinks.size > 0) {
        const tracer = context.container.has(TRACER_TOKEN)
          ? await context.container.resolve<CelerityTracer>(TRACER_TOKEN)
          : undefined;

        const configService = await context.container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
        const resourceConfig = configService.namespace(RESOURCE_CONFIG_NAMESPACE);
        const tokenProviderFactory = await resolveTokenProviderFactory(this.config.platform);

        for (const [resourceName, configKey] of cacheLinks) {
          await this.initializeResource(
            context.container,
            resourceName,
            configKey,
            resourceConfig,
            tracer,
            tokenProviderFactory,
          );
        }

        if (cacheLinks.size === 1) {
          const [resourceName] = [...cacheLinks.keys()];
          await this.registerDefaultTokens(context.container, resourceName);
        }
      }

      this.initialized = true;
    }

    return next();
  }

  private async initializeResource(
    container: ServiceContainer,
    resourceName: string,
    configKey: string,
    resourceConfig: ConfigNamespace,
    tracer: CelerityTracer | undefined,
    tokenProviderFactory: TokenProviderFactory | undefined,
  ): Promise<void> {
    debug("resolving cache resource %s (configKey=%s)", resourceName, configKey);

    const credentials = await resolveCacheCredentials(
      configKey,
      resourceConfig,
      tokenProviderFactory,
    );
    const connectionOverrides = await resolveConnectionOverrides(configKey, resourceConfig);
    const connectionConfig = resolveConnectionConfig(
      this.config!.deployTarget,
      connectionOverrides,
    );
    const info = await credentials.getConnectionInfo();

    // Build auth token provider for IAM mode
    let authTokenProvider: (() => Promise<string>) | undefined;
    if (info.authMode === "iam") {
      authTokenProvider = async () => {
        const auth = await credentials.getIamAuth();
        return auth.token;
      };
    }

    // Build password auth token
    let authToken: string | undefined;
    if (info.authMode === "password") {
      try {
        const passwordAuth = await credentials.getPasswordAuth();
        authToken = passwordAuth.authToken;
      } catch {
        // No auth token configured (e.g., local Valkey with no auth)
      }
    }

    const redisCacheConfig: RedisCacheConfig = {
      host: info.host,
      port: info.port,
      tls: info.tls,
      clusterMode: info.clusterMode,
      authMode: info.authMode,
      connectionConfig,
      ...(authToken ? { authToken } : {}),
      ...(info.user ? { user: info.user } : {}),
      ...(authTokenProvider ? { authTokenProvider } : {}),
    };

    const client = await createCacheClient({ config: redisCacheConfig, tracer });
    const cache = client.cache(resourceName, info.keyPrefix);

    container.register(cacheToken(resourceName), { useValue: cache });
    container.register(cacheCredentialsToken(resourceName), { useValue: credentials });
    container.register(cacheClientToken(resourceName), {
      useValue: client,
      onClose: () => client.close(),
    });

    debug("registered cache resource %s", resourceName);
  }

  private async registerDefaultTokens(
    container: ServiceContainer,
    resourceName: string,
  ): Promise<void> {
    const cache = await container.resolve(cacheToken(resourceName));
    const creds = await container.resolve(cacheCredentialsToken(resourceName));

    container.register(DEFAULT_CACHE_TOKEN, { useValue: cache });
    container.register(DEFAULT_CACHE_CREDENTIALS_TOKEN, { useValue: creds });

    debug("registered default cache tokens → %s", resourceName);
  }
}
