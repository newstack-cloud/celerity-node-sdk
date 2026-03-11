import createDebug from "debug";
import type { CelerityTracer } from "@celerity-sdk/types";
import type { CacheClient, Cache } from "../../types";
import { RedisCache } from "./redis-cache";
import type { RedisCacheConfig } from "./types";

const debug = createDebug("celerity:cache:redis");

export class RedisCacheClient implements CacheClient {
  private client: import("ioredis").default | import("ioredis").Cluster | null = null;
  private readonly config: RedisCacheConfig;

  constructor(
    config: RedisCacheConfig,
    private readonly tracer?: CelerityTracer,
  ) {
    this.config = config;
  }

  cache(name: string, keyPrefix?: string): Cache {
    return new RedisCache(name, this.getClient(), this.config.clusterMode, this.tracer, keyPrefix);
  }

  async close(): Promise<void> {
    if (this.client) {
      debug("closing Redis connection");
      await this.client.quit();
      this.client = null;
    }
  }

  private getClient(): import("ioredis").default | import("ioredis").Cluster {
    if (!this.client) {
      this.client = this.createClient();
    }
    return this.client;
  }

  private createClient(): import("ioredis").default | import("ioredis").Cluster {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ioredis = require("ioredis");
    const Redis = ioredis.default ?? ioredis;

    const { host, port, tls, clusterMode, connectionConfig, authToken, user, authTokenProvider } =
      this.config;

    const baseOptions: import("ioredis").RedisOptions = {
      lazyConnect: connectionConfig.lazyConnect,
      connectTimeout: connectionConfig.connectTimeoutMs,
      commandTimeout: connectionConfig.commandTimeoutMs || undefined,
      keepAlive: connectionConfig.keepAliveMs || undefined,
      maxRetriesPerRequest: connectionConfig.maxRetries,
      retryStrategy: (times: number) => {
        if (times > connectionConfig.maxRetries) return null;
        return connectionConfig.retryDelayMs;
      },
      ...(tls ? { tls: {} } : {}),
      ...(user ? { username: user } : {}),
      ...(authToken ? { password: authToken } : {}),
      ...(authTokenProvider ? { authTokenProvider } : {}),
    };

    if (clusterMode) {
      debug("creating ioredis Cluster client → %s:%d", host, port);
      const Cluster = Redis.Cluster ?? ioredis.Cluster;
      return new Cluster([{ host, port }], {
        redisOptions: baseOptions,
        dnsLookup: undefined,
        enableReadyCheck: true,
        scaleReads: "slave",
      });
    }

    debug("creating ioredis client → %s:%d", host, port);
    return new Redis({ host, port, ...baseOptions });
  }
}
